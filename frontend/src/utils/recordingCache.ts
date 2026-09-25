export type CachedRecording = { blob: Blob; duration: number; attempt: number };
let connection: Promise<IDBDatabase> | undefined;
function database() {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("impromptu-recordings-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("recordings");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return connection;
}
export async function recordingCache(key: string, action: "read" | "write" | "delete", value?: CachedRecording): Promise<CachedRecording | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("recordings", action === "read" ? "readonly" : "readwrite");
    const store = transaction.objectStore("recordings");
    const request = action === "read" ? store.get(key) : action === "write" ? store.put(value, key) : store.delete(key);
    transaction.oncomplete = () => resolve(action === "read" ? request.result : undefined);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
