import { useEffect, useState } from "react";

const PROJECT_KEY = "pacchq.project.id";

export function useActiveProjectId() {
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    function read() {
      try {
        setId(localStorage.getItem(PROJECT_KEY));
      } catch {
        setId(null);
      }
    }
    read();
    function onStorage(e: StorageEvent) {
      if (e.key === PROJECT_KEY) read();
    }
    window.addEventListener("storage", onStorage);
    // Also poll once shortly after mount because the selector writes
    // after projects load and same-tab writes don't fire `storage`.
    const t = setInterval(read, 1000);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(t);
    };
  }, []);

  return id;
}
