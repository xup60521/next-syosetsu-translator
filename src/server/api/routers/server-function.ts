
import { z } from "zod";
import {
    createTRPCRouter,
    protectedProcedure,
    publicProcedure,
} from "@/server/api/trpc";
import { qstashClient } from "@/lib/qstash-client";
import { redis } from "@/lib/redis";
import { revalidatePath } from "next/cache";
import { URLPattern } from "urlpattern-polyfill";
import { load } from "cheerio";
import { encrypt } from "@/lib/cryptography";
import { modelList } from "@/lib/model_list";
import { novel_handler } from "@/lib/novel_handler/novel_handler";
import { account } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";
import type { WorkflowPayloadType } from "@/lib/utils";
import { env } from "@/env";
import { TRPCError } from "@trpc/server";

// Helper types and functions for decomposeUrl
export type DecomposedURL = { title: string | undefined; url: string };

async function decompose_kakuyomu(
    url: URL
): Promise<DecomposedURL[]> {
    const series_pattern = new URLPattern({
        baseURL: "https://kakuyomu.jp/",
        pathname: "/works/:series_id",
    });
    if (series_pattern.test(url)) {
        const seriesPageHTML = await fetch(url).then((res) => res.text());
        const seiresPage$ = load(seriesPageHTML);
        const first_episode_url = seiresPage$("aside a").first().attr("href");
        if (!first_episode_url) return [];
        const sidebar_url = new URL(
            "https://kakuyomu.jp" + first_episode_url + "/episode_sidebar"
        );
        return await decompose_kakuyomu(sidebar_url);
    }
    const single_episode_pattern = new URLPattern({
        baseURL: "https://kakuyomu.jp/",
        pathname: "/works/:series_id/episodes/:work_id",
    });
    if (single_episode_pattern.test(url)) {
        return [{ url: url.toString(), title: undefined }];
    }
    const episode_sidebar_pattern = new URLPattern({
        baseURL: "https://kakuyomu.jp/",
        pathname: "/works/:series_id/episodes/:work_id/episode_sidebar",
    });
    if (episode_sidebar_pattern.test(url)) {
        const pageHtml = await fetch(url).then((res) => res.text());
        const $ = load(pageHtml);
        const urlArr = $("li a")
            .toArray()
            .map((elm) => ({
                url: "https://kakuyomu.jp" + $(elm).attr("href"),
                title: $(elm).text(),
            }))
            .filter((d) => !!d) as DecomposedURL[];
        return urlArr;
    }
    return [];
}

async function decompose_syosetsu(
    url: URL
): Promise<{ title: string | undefined; url: string }[]> {
    const decomposed_urls = [] as { title: string | undefined; url: string }[];

    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length === 1) {
        const response = await fetch(
            `https://api.syosetu.com/novelapi/api/?ncode=${pathParts[0]}&out=json`
        );
        const novel_count = (await response.json())[1].general_all_no as number;
        const urls = new Array(novel_count).fill(null).map((_, i) => ({
            title: undefined,
            url: `https://ncode.syosetu.com/${pathParts[0]}/${i + 1}/`,
        }));

        decomposed_urls.push(...urls);
    } else if (pathParts.length === 2) {
        decomposed_urls.push({ url: url.toString(), title: undefined });
    } else {
        throw new Error(
            "The URL does not point to a valid syosetsu novel series or episode: " +
            url.toString()
        );
    }
    return decomposed_urls;
}

async function decompose_pixiv(
    url: URL
): Promise<DecomposedURL[]> {
    const seriesMatch = url.pathname.match(/^\/novel\/series\/(\d+)\/?$/);
    if (seriesMatch) {
        const series_id = seriesMatch[1];
        if (!series_id) {
            throw new Error(
                "Could not extract series ID from URL: " + url.toString()
            );
        }

        const fetchOptions: RequestInit = {};
        fetchOptions.headers = {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:146.0) Gecko/20100101 Firefox/146.0",
        };

        const response = await fetch(
            `https://www.pixiv.net/ajax/novel/series/${series_id}/content_titles`,
            fetchOptions
        );
        const series_content_titles = (await response.json()).body;

        const novel_ids = series_content_titles
            .map((d: { id: string; available: boolean; title: string }) =>
                d.available
                    ? {
                        title: d.title,
                        url: `https://www.pixiv.net/novel/show.php?id=${d.id}`,
                    }
                    : null
            )
            .filter(
                (d: { title: string | undefined; url: string } | null) => d
            ) as { title: string | undefined; url: string }[];
        return novel_ids;
    }
    if (url.pathname.includes("/novel/show")) {
        return [{ title: undefined, url: url.toString() }];
    }
    if (url.pathname.includes("/ajax/")) {
        throw new Error(
            "To reduce confusion, you should not use the ajax URL. Use the normal URL instead."
        );
    }
    throw new Error(
        "The URL is not a valid Pixiv novel series or novel page: " +
        url.toString()
    );
}

const urlSchema = z.string().transform((val, ctx) => {
    const parts = val.trim().split(/\s+/);
    for (const part of parts) {
        const result = z.string().url().safeParse(part);
        if (!result.success) {
            ctx.addIssue({
                code: "custom",
                message: `"${part}" is not a valid URL`,
            });
        }
    }
    return parts.join(" ");
});

interface RedisTaskData {
    status: string;
    progress: string | number;
    current: string | number;
    total: string | number;
    urls: string;
    error_message?: string;
    created_at?: string | number;
    provider?: string;
    model_id?: string;
    api_key_name?: string;
}

export const serverFunctionRouter = createTRPCRouter({
    cancelWorkflow: protectedProcedure
        .input(z.object({ workflow_id: z.string() }))
        .mutation(async ({ input }) => {
            const { workflow_id } = input;
            await qstashClient.cancel({ ids: [workflow_id] });
            await redis.hset(`task:${workflow_id}`, {
                status: "canceled",
            });
            revalidatePath("/history");
            return "ok";
        }),

    decomposeUrl: publicProcedure
        .input(
            z.object({
                url_string: urlSchema,
                with_Cookies: z.boolean().optional().default(false),
            })
        )
        .query(async ({ input }) => {
            const { url_string, with_Cookies } = input;
            const urls = url_string.split(" ");
            const novel_urls: DecomposedURL[] = [];
            for await (const url of urls) {
                const urlobj = new URL(url);
                if (urlobj.host === "www.pixiv.net") {
                    const processed_urls = await decompose_pixiv(
                        urlobj
                    );

                    novel_urls.push(...processed_urls);
                } else if (urlobj.host === "ncode.syosetu.com") {
                    const processed_urls = await decompose_syosetsu(
                        urlobj
                    );

                    novel_urls.push(...processed_urls);
                } else if (urlobj.host === "kakuyomu.jp") {
                    const processed_urls = await decompose_kakuyomu(
                        urlobj
                    );

                    novel_urls.push(...processed_urls);
                } else {
                    novel_urls.push({ url: url.toString(), title: undefined });
                }
            }
            return novel_urls;
        }),

    deleteHistory: protectedProcedure
        .input(z.string())
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.session.user.id;
            const taskId = input;
            if (!taskId) {
                throw new Error("Missing taskId");
            }

            await redis.del(`task:${taskId}`);
            await redis.zrem(`user:tasks:${userId}`, taskId);
            revalidatePath("/history");
            return { success: true };
        }),

    encrypt: publicProcedure
        .input(z.string())
        .mutation(async ({ input }) => {
            const encrypted_string = encrypt(input);
            return encrypted_string;
        }),

    getModelList: publicProcedure
        .input(z.string())
        .query(async ({ input }) => {
            const provider = input;
            const getter = modelList[provider];
            if (!getter) {
                throw new Error("Invalid provider");
            }
            return await getter();
        }),

    history: protectedProcedure
        .query(async ({ ctx }) => {
            try {
                const userId = ctx.session.user.id;
                const taskIds = await redis.zrange(`user:tasks:${userId}`, 0, 19, {
                    rev: true,
                });

                if (!taskIds || taskIds.length === 0) {
                    return [];
                }

                const pipeline = redis.pipeline();
                taskIds.forEach((id) => {
                    pipeline.hgetall(`task:${id}`);
                });

                const results = await pipeline.exec<RedisTaskData[]>();

                const history = taskIds
                    .map((id, index) => {
                        const data = results[index];

                        if (!data || Object.keys(data).length === 0) return null;

                        return {
                            taskId: id as string,
                            status: data.status,
                            progress: Number(data.progress || 0),
                            current: Number(data.current || 0),
                            total: Number(data.total || 0),
                            urls: data.urls ? data.urls : [],
                            errorMessage: data.error_message || null,
                            createdAt: data.created_at ? Number(data.created_at) : null,
                            provider: data.provider || null,
                            model: data.model_id || null,
                            apiKeyName: data.api_key_name || null,
                        };
                    })
                    .filter(Boolean);

                return history;
            } catch (error) {
                console.error("Upstash Redis Error:", error);
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Internal Server Error",
                });
            }
        }),

    novelHandler: publicProcedure
        .input(
            z.object({
                url: z.string().url(),
                with_Cookies: z.boolean().optional().default(false),
            })
        )
        .query(async ({ input }) => {
            const { url, with_Cookies } = input;
            return novel_handler(url, { with_Cookies });
        }),

    translate: protectedProcedure
        .input(
            z.object({
                urls: z.array(z.string().url({ message: "Invalid URL format" })),
                provider: z.string().min(1, "Provider is required"),
                encrypted_api_key: z.string().min(1, "API key is required"),
                model_id: z.string().min(1, "Model ID is required"),
                concurrency: z.number().int().positive(),
                batch_size: z.number().int().positive(),
                folder_id: z.string().min(1, "Folder ID is required"),
                api_key_name: z.string().optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const session = ctx.session;

            const userAccount = await ctx.db.query.account.findFirst({
                where: and(
                    eq(account.userId, session.user.id),
                    eq(account.providerId, "google")
                ),
            });

            const google_refresh_token = userAccount?.refreshToken;

            if (!google_refresh_token) {
                console.error("No Google Refresh Token found for this user");
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "No refresh token",
                });
            }

            const { userId } = userAccount;
            const payload = { ...input, user_id: userId } as WorkflowPayloadType;

            const { workflowRunId } = await qstashClient.trigger({
                url: env.BETTER_AUTH_URL! + "/api/workflow",
                headers: {
                    "Content-Type": "application/json",
                },
                body: payload,
                retries: 3,
            });

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
                .expire(`task:${workflowRunId}`, 604800)
                .exec();
            revalidatePath("/history");
            return "ok";
        }),
});
