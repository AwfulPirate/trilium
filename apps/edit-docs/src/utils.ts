import cls from "@triliumnext/server/src/services/cls.js";
import fs from "fs/promises";
import fsExtra from "fs-extra";
import path from "path";
import electron from "electron";
import { deferred, type DeferredPromise } from "@triliumnext/server/src/services/utils.js";
import windowService from "@triliumnext/server/src/services/window.js";

export function initializeDatabase(skipDemoDb: boolean) {
    return new Promise<void>(async (resolve) => {
        const sqlInit = (await import("@triliumnext/server/src/services/sql_init.js")).default;
        cls.init(async () => {
            if (!sqlInit.isDbInitialized()) {
                await sqlInit.createInitialDatabase(skipDemoDb);
            }
            resolve();
        });
    });
}

/**
 * Electron has a behaviour in which the "ready" event must have a listener attached before it gets to initialize.
 * If async tasks are awaited before the "ready" event is bound, then the window will never shown.
 * This method works around by creating a deferred promise. It will immediately bind to the "ready" event and wait for that promise to be resolved externally.
 *
 * @param callback a method to be called after the server and Electron is initialized.
 * @returns the deferred promise that must be resolved externally before the Electron app is started.
 */
export function startElectron(callback: () => void): DeferredPromise<void> {
    const initializedPromise = deferred<void>();
    electron.app.on("ready", async () => {
        await initializedPromise;

        console.log("Electron is ready!");

        // Start the server.
        await import("@triliumnext/server/src/main.js");

        // Create the main window.
        await windowService.createMainWindow(electron.app);

        callback();
    });
    return initializedPromise;
}

export async function extractZip(zipFilePath: string, outputPath: string, ignoredFiles?: Set<string>) {
    const deferred = (await import("@triliumnext/server/src/services/utils.js")).deferred;

    const promise = deferred<void>()
    setTimeout(async () => {
        // Then extract the zip.
        const { readZipFile, readContent } = (await import("@triliumnext/server/src/services/import/zip.js"));
        await readZipFile(await fs.readFile(zipFilePath), async (zip, entry) => {
            // We ignore directories since they can appear out of order anyway.
            if (!entry.fileName.endsWith("/") && !ignoredFiles?.has(entry.fileName)) {
                const destPath = path.join(outputPath, entry.fileName);
                const fileContent = await readContent(zip, entry);

                await fsExtra.mkdirs(path.dirname(destPath));
                await fs.writeFile(destPath, fileContent);
            }

            zip.readEntry();
        });
        promise.resolve();
    }, 1000);
    await promise;
}
