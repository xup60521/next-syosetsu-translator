import { novel_handler } from "@/lib/novel_handler/novel_handler";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

export const novel_handler_serverfn = createServerFn()
    .inputValidator(
        z.object({
            url: z.url(),
            with_Cookies: z.boolean().optional().default(false),
        })
    )
    .handler(async ({ data }) => {
        const { url, with_Cookies } = data;
        return novel_handler(url, { with_Cookies });
    });
