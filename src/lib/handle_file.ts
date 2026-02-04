import { env } from "@/env";
import { Readable } from "stream";
import { drive } from "@googleapis/drive"
import { OAuth2Client } from "google-auth-library";

export async function handle_file({
    series_title_and_author,
    title,
    indexPrefix,
    content,
    istranslated = true,
    folder_id,
    refresh_token,
}: {
    series_title_and_author: string;
    title: string;
    indexPrefix: string;
    content: string;
    istranslated?: boolean;
    folder_id: string;
    refresh_token: string;
}) {
    const oauth2Client = new OAuth2Client(
        env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({ refresh_token });
    const gdrive = drive({ version: "v3", auth: oauth2Client });

    try {
        // 1. 尋找或建立 series 子資料夾 (與之前相同)
        let targetFolderId: string;
        const folderSearch = await gdrive.files.list({
            q: `name = '${series_title_and_author}' and '${folder_id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: "files(id)",
        });

        if (folderSearch.data.files && folderSearch.data.files.length > 0) {
            targetFolderId = folderSearch.data.files[0]!.id!;
        } else {
            const newFolder = await gdrive.files.create({
                requestBody: {
                    name: series_title_and_author,
                    mimeType: "application/vnd.google-apps.folder",
                    parents: [folder_id],
                },
                fields: "id",
            });
            targetFolderId = newFolder.data.id!;
        }

        // 2. 準備檔案名稱
        const fileName = `${indexPrefix}-${title}${istranslated ? "_translated" : ""
            }.txt`;

        // 3. 搜尋是否已存在同名檔案
        const fileSearch = await gdrive.files.list({
            q: `name = '${fileName}' and '${targetFolderId}' in parents and trashed = false`,
            fields: "files(id)",
        });

        const existingFileId =
            fileSearch.data.files && fileSearch.data.files.length > 0
                ? fileSearch.data.files[0]!.id
                : null;

        const media = {
            mimeType: "text/plain",
            body: Readable.from([content]),
        };

        if (existingFileId) {
            // 4a. 如果檔案存在，執行更新 (Overwrite)
            await gdrive.files.update({
                fileId: existingFileId,
                media: media,
            });
            //   console.log(`檔案已更新: ${fileName}`);
        } else {
            // 4b. 如果檔案不存在，執行建立
            await gdrive.files.create({
                requestBody: {
                    name: fileName,
                    parents: [targetFolderId],
                },
                media: media,
            });
            //   console.log(`檔案已建立: ${fileName}`);
        }
    } catch (error) {
        console.error("操作 Google Drive 時發生錯誤:", error);
        throw error;
    }
}