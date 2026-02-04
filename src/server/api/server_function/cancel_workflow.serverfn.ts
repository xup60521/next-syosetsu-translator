import { qstashClient } from "@/lib/qstash-client";
import { redis } from "@/lib/redis";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

export const cancel_workflow_serverfn = createServerFn()
    .inputValidator(z.object({ workflow_id: z.string() }))
    .handler(async ({ data }) => {
        const { workflow_id } = data;
        qstashClient.cancel({ ids: [workflow_id] });
        await redis.hset(`task:${workflow_id}`, {
            status: "canceled",
        });
        return "ok";
    });
