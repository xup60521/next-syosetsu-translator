import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import z from "zod";
import { account } from "@/db/auth-schema";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { and, eq } from "drizzle-orm";
import { WorkflowPayloadType } from "@/lib/utils";
import { redis } from "@/lib/redis";
import { env } from "@/env";
import { qstashClient } from "@/lib/qstash-client";

const dataSchema = z.object({
    urls: z.array(z.url({ message: "Invalid URL format" })),
    provider: z.string().min(1, "Provider is required"),
    encrypted_api_key: z.string().min(1, "API key is required"),
    model_id: z.string().min(1, "Model ID is required"),
    concurrency: z.number().int().positive(),
    batch_size: z.number().int().positive(),
    folder_id: z.string().min(1, "Folder ID is required"),
    api_key_name: z.string().optional(),
});

export const translate_serverfn = createServerFn({ method: "POST" })
    .inputValidator(dataSchema)
    .handler(async ({ data }) => {
        const headers = getRequestHeaders();
        const session = await auth.api.getSession({ headers });
        if (!session?.session) {
            throw new Error("Unauthorized");
        }
        // console.log("authorized")
        const userAccount = await db.query.account.findFirst({
            where: and(
                eq(account.userId, session.user.id),
                eq(account.providerId, "google")
            ),
        });

        const google_refresh_token = userAccount?.refreshToken;

        if (!google_refresh_token) {
            // 如果沒有拿到，可能是沒加 access_type: offline 或使用者需要重新授權
            console.error("No Google Refresh Token found for this user");
            throw new Error("No refresh token");
        }
        // console.log("refresh token exists")
        const { userId } = userAccount;
        const payload = { ...data, user_id: userId } as WorkflowPayloadType;
        // console.log(payload)


        const { workflowRunId } = await qstashClient.trigger({
            // Your workflow route handler
            url: env.BETTER_AUTH_URL! + "/api/workflow",
            headers: {
                "Content-Type": "application/json",
            },
            body: payload,
            retries: 3,
            keepTriggerConfig: true,
            useFailureFunction: true
        });
        // console.log("workflow is triggered")

        await redis
            .pipeline()
            .zadd(`user:tasks:${userId}`, {
                score: Date.now(),
                member: workflowRunId,
            })
            .hset(`task:${workflowRunId}`, {
                status: "starting",
                progress: 0,
                current: 0,
                total: payload.urls.length,
                urls: JSON.stringify(payload.urls),
                created_at: Date.now(),
                provider: payload.provider,
                model_id: payload.model_id,
                api_key_name: payload.api_key_name || "",
            })
            .expire(`task:${workflowRunId}`, 604800) // 7 days後自動過期
            .exec();

        // console.log("update progress to redis")

        return "ok";
    });
