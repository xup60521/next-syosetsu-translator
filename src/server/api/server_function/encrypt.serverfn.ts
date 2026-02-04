import { encrypt } from "@/lib/cryptography";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

export const encrypt_serverfn = createServerFn()
    .inputValidator(z.string())
    .handler(async ({ data }) => {
        const encrypted_string = encrypt(data);
        return encrypted_string;
    });
