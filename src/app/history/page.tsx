import { Button } from "@/components/ui/button";
import { auth } from "@/server/better-auth";



import HistoryClientPage from "./-historyClient";
import Link from "next/link";
import { headers } from "next/headers";

/**
 * Server function to check session status.
 * TanStack Start uses 'getWebRequest' to access headers/cookies.
 */


export default async function HistoryPage() {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.session) {
        return <UnauthorizedPage />;
    }

    return <HistoryClientPage />;
}

function UnauthorizedPage(): React.JSX.Element {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-6">
            <div className="space-y-2 text-center">
                <h1 className="text-3xl font-bold">Access Denied</h1>
                <p className="text-muted-foreground">
                    You need to connect a Google Drive account to access your
                    history.
                </p>
            </div>
            {/* 
          In TanStack Router, it's better to use the 'asChild' pattern 
          or pass the component to the 'Link' to maintain proper routing. 
      */}
            <Button asChild>
                <Link href="/settings">Go to Settings</Link>
            </Button>
        </div>
    );
}
