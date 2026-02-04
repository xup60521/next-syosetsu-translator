import { modelList } from "@/lib/model_list";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";


export const get_modelList_serverfn = createServerFn().inputValidator(z.string()).handler(async ({ data }) => {
    const provider = data
    const getter = modelList[provider]
    if (!getter) {
        throw new Error("Invalid provider")
    }
    return await getter()
})