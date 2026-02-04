import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { env } from "@/env";
import * as schema from "./schema";


export const db = drizzle(neon(env.DATABASE_URL!), { schema });
