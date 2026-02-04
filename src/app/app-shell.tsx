"use client"

import z from "zod";
import NovelView from "./-NovelView";
import { toast } from "sonner";
import { useEffect } from "react";
import React from "react";
import { cn } from "@/lib/utils";

import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";

import { HistoryIcon, Settings as SettingsIcon, Settings2 as SettingsIcon2, Moon, Sun, HomeIcon } from "lucide-react";

import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { useTheme } from "next-themes";
import { useHistoryState, type HistoryState } from "@/hooks/use-history-state";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";




export default function App() {
    // Don't use Route.useSearch because the length of url_string may be too long for URL query params
    // use location.state instead
    const [{ url_string }, setState] = useHistoryState();

    return (
        <div className="w-full h-screen flex flex-col md:px-8 md:py-3 px-3 py-2 md:gap-3 gap-2 bg-amber-50 dark:bg-zinc-950/50 bg-[radial-gradient(var(--bg-pattern-color)_1px,transparent_1px)] bg-size-[16px_16px]">
            <InputBar urlString={url_string} setState={setState} />
            {url_string !== "" && url_string !== null && (
                <NovelView url_string={url_string} />
            )}
        </div>
    );
}

const urlString_schema = z.string().refine((value) => {
    const urls = value.split(" ");
    for (const url of urls) {
        try {
            new URL(url);
        } catch (e) {
            return false;
        }
    }
    return true;
});



function InputBar({ urlString, setState }: { urlString: string; setState: (value: HistoryState | ((prev: HistoryState) => HistoryState)) => void }): React.JSX.Element {

    const ref = React.useRef<HTMLInputElement>(null);
    const location = usePathname()

    function onClickTranslate() {
        const inputValue = ref.current?.value;
        if (inputValue && urlString_schema.safeParse(inputValue).success) {
            // navigate({ to: `?url_string=${inputValue}` });
            setState({ url_string: inputValue });
        } else {
            toast.error("Please enter valid URLs separated by spaces.", {
                className: "!bg-red-800 !text-white",
            });
        }
    }

    const isDetailPage = urlString !== "";
    useEffect(() => {
        if (typeof window !== undefined) {
            const path = location;
            if (path === "/") {
                localStorage.setItem("preview_url_string", urlString);
            }
        }
    }, [location]);
    return (
        <div
            className={cn(
                "w-full h-screen flex justify-center items-center pr-1",
                isDetailPage && "h-fit",
            )}
        >
            <div
                className={cn(
                    "max-w-150 w-full flex flex-col items-center gap-4",
                    isDetailPage && "flex-row max-w-screen w-full gap-2 justify-between",
                )}
            >
                <h1
                    className={cn(
                        "font-bold text-xl sm:text-2xl font-mono text-center sm:text-left w-fit",
                    )}
                >

                    {isDetailPage ? (
                        <Button variant={"outline"} onClick={() => {
                            if (ref.current?.value) {
                                ref.current.value = "";
                            }
                            setState({ url_string: "" });
                        }}>
                            <HomeIcon />
                        </Button>
                    ) : (
                        <span>
                            Syosetsu Translator
                        </span>
                    )}

                </h1>
                <div
                    className={cn(
                        "flex w-full gap-2 flex-col items-center flex-wrap",
                        isDetailPage && "flex-row grow flex-nowrap",
                    )}
                >
                    <Input
                        placeholder="Input novel urls, separated by space"
                        className="placeholder:text-gray-400 min-w-0 py-2"
                        ref={ref}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") return onClickTranslate();
                        }}
                        defaultValue={urlString ?? ""}
                    />
                    <Button onClick={onClickTranslate}>Enter</Button>
                </div>
                <div
                    className={cn(
                        "fixed top-2 right-3 z-50 flex gap-2",
                        isDetailPage &&
                        "relative top-0 right-0 shrink-0 w-fit",
                    )}
                >
                    <Link href="/history" prefetch={true}>
                        <Button variant={"outline"}>
                            <HistoryIcon />
                        </Button>
                    </Link>

                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant={"outline"}>
                                <SettingsIcon2 />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="border-2 border-black dark:border-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] bg-white dark:bg-zinc-900 p-0 w-56 rounded-none">
                            <ThemeMenu />
                            <Link href="/settings" className="flex items-center gap-3 p-3 font-mono font-bold hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors group">
                                <SettingsIcon className="size-4 group-hover:rotate-90 transition-transform" />
                                <span>Settings</span>
                            </Link>
                        </PopoverContent>
                    </Popover>
                </div>
            </div>
        </div>
    );
}


function ThemeMenu(): React.JSX.Element {
    const { theme, setTheme } = useTheme();

    return (
        <div className="flex flex-col">
            <div className="px-3 py-2 bg-yellow-300 dark:bg-yellow-600 border-b-2 border-black dark:border-white">
                <span className="text-sm font-mono font-black uppercase tracking-tight">Appearance</span>
            </div>
            <div className="grid grid-cols-2 border-b-2 border-black dark:border-white divide-x-2 divide-black dark:divide-white">
                <button
                    onClick={() => setTheme("light")}
                    className={cn(
                        "flex items-center justify-center gap-2 p-3 cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900 transition-colors outline-none",
                        theme === "light" && "bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
                    )}
                >
                    <Sun className="size-4" />
                    <span className="font-mono font-bold text-sm">Light</span>
                </button>
                <button
                    onClick={() => setTheme("dark")}
                    className={cn(
                        "flex items-center justify-center gap-2 p-3 cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900 transition-colors outline-none",
                        theme === "dark" && "bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
                    )}
                >
                    <Moon className="size-4" />
                    <span className="font-mono font-bold text-sm">Dark</span>
                </button>
            </div>
        </div>
    );
}