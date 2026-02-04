import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import z from "zod";

export const delete_history_serverfn = createServerFn()
    .inputValidator(z.string())
    .handler(async ({ data }) => {
        const headers = getRequestHeaders();
        const session = await auth.api.getSession({ headers });
        const userId = session?.session.userId;

        if (!userId) {
            throw new Error("Unauthorized");
        }
        const taskId = data;
        if (!taskId) {
            throw new Error("Missing taskId");
        }

        await redis.del(`task:${taskId}`);
        await redis.zrem(`user:tasks:${userId}`, taskId);

        return { success: true };
    });
