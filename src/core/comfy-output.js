const outputCollectionKeys = new Set([
    "images",
    "gifs",
    "videos",
    "audio",
    "files"
]);
const videoOutputPattern = /\.(mp4|webm|mov|m4v|mkv)$/i;
export function isVideoOutputFilename(filename) {
    return videoOutputPattern.test(filename);
}
export function extractComfyOutputFiles(value) {
    const results = [];
    const seen = new Set();
    const add = (candidate) => {
        if (typeof candidate.filename !== "string" || !candidate.filename.trim())
            return;
        const file = {
            filename: candidate.filename,
            subfolder: typeof candidate.subfolder === "string" ? candidate.subfolder : "",
            type: typeof candidate.type === "string" ? candidate.type : "output",
            format: typeof candidate.format === "string" ? candidate.format : undefined
        };
        const key = `${file.type}\0${file.subfolder}\0${file.filename}`;
        if (!seen.has(key)) {
            seen.add(key);
            results.push(file);
        }
    };
    const visit = (node, collectionKey = "") => {
        if (Array.isArray(node)) {
            for (const item of node) {
                if (outputCollectionKeys.has(collectionKey) &&
                    item &&
                    typeof item === "object") {
                    add(item);
                }
                visit(item, collectionKey);
            }
            return;
        }
        if (!node || typeof node !== "object")
            return;
        for (const [key, child] of Object.entries(node)) {
            visit(child, key);
        }
    };
    visit(value);
    return results;
}
