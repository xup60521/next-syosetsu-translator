"use client"
import dynamic from "next/dynamic";

const Shell = dynamic(() => import("./app-shell"), { ssr: false });

export default function Page() {
    return <Shell />
}