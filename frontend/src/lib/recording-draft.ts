export type RecordingDraft = {
  name: string;
  mimeType: string;
  kind: "audio" | "video";
  seconds: number;
  complete: boolean;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("blindspot-recording-draft", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("metadata");
      request.result.createObjectStore("chunks", { autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Close other recording tabs and try again."));
  });
}

async function writeDraft(change: (tx: IDBTransaction) => void) {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["metadata", "chunks"], "readwrite");
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error("Could not save the recording draft."));
      tx.onerror = () => reject(tx.error);
      change(tx);
    });
  } finally {
    db.close();
  }
}

export function beginDraft(metadata: RecordingDraft) {
  return writeDraft(tx => {
    tx.objectStore("chunks").clear();
    tx.objectStore("metadata").put(metadata, "draft");
  });
}

export function saveChunk(chunk: Blob, metadata: RecordingDraft) {
  return writeDraft(tx => {
    tx.objectStore("chunks").add(chunk);
    tx.objectStore("metadata").put(metadata, "draft");
  });
}

export function finishDraft(metadata: RecordingDraft) {
  return writeDraft(tx => tx.objectStore("metadata").put(metadata, "draft"));
}

export function deleteDraft() {
  return writeDraft(tx => {
    tx.objectStore("metadata").clear();
    tx.objectStore("chunks").clear();
  });
}

export async function loadDraft(): Promise<{ metadata: RecordingDraft; file: File } | null> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(["metadata", "chunks"], "readonly");
      const meta = tx.objectStore("metadata").get("draft");
      const chunks = tx.objectStore("chunks").getAll();
      tx.oncomplete = () => {
        if (!meta.result || !chunks.result.length) return resolve(null);
        const metadata = meta.result as RecordingDraft;
        resolve({ metadata, file: new File(chunks.result, metadata.name, { type: metadata.mimeType }) });
      };
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
