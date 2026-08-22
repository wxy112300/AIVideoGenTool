const HUGGING_FACE_HOSTS = new Set(["huggingface.co", "www.huggingface.co"]);
export function rewriteHuggingFaceDownloadUrl(url, useMirror) {
    if (!useMirror)
        return url;
    try {
        const parsed = new URL(url);
        if (!HUGGING_FACE_HOSTS.has(parsed.hostname.toLowerCase()))
            return url;
        parsed.hostname = "hf-mirror.com";
        return parsed.toString();
    }
    catch {
        return url;
    }
}
