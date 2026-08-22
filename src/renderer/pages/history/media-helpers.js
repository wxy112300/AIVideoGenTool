import { uiKeys } from "../../../core/i18n-keys";
import { historyCoverCandidates } from "./helpers";
import { createHistoryMediaScheduler } from "./media-scheduler";
const HISTORY_COVER_MAX_EDGE = 640;
const IMAGE_HISTORY_THUMBNAIL_MAX_EDGE = 640;
export function createHistoryMediaRuntime(context, isHistoryListPage) {
    const historyCoverDataUrls = new Map();
    const imageHistoryThumbnailDataUrls = new Map();
    const historyCoverCacheMisses = new Set();
    const historyCoverReads = new Map();
    const historyCoverScheduler = createHistoryMediaScheduler(1);
    const loadImageHistoryThumbnail = async (image, signal) => {
        const key = image.dataset.imageHistoryCacheKey ?? "";
        const sourcePath = image.dataset.imageHistorySource ?? "";
        const isActive = () => !signal?.aborted && image.isConnected;
        if (!key || !sourcePath || !isActive())
            return false;
        try {
            const cached = imageHistoryThumbnailDataUrls.get(key) ??
                await context.studio.readHistoryCover(key, sourcePath);
            if (cached && isActive()) {
                imageHistoryThumbnailDataUrls.set(key, cached);
                image.src = cached;
                return true;
            }
            if (!isActive())
                return false;
            const sourceData = await context.studio.readImage(sourcePath);
            if (!sourceData || !isActive())
                return false;
            const source = document.createElement("img");
            source.src = sourceData;
            if (!isActive())
                return false;
            await source.decode();
            if (!source.naturalWidth || !source.naturalHeight || !isActive())
                return false;
            const scale = Math.min(1, IMAGE_HISTORY_THUMBNAIL_MAX_EDGE / Math.max(source.naturalWidth, source.naturalHeight));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
            const canvasContext = canvas.getContext("2d");
            if (!canvasContext || !isActive())
                return false;
            canvasContext.drawImage(source, 0, 0, canvas.width, canvas.height);
            // PNG keeps the alpha channel so transparent BiRefNet results remain
            // transparent in the history gallery instead of becoming black JPEGs.
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
            if (!blob || blob.size > 2 * 1024 * 1024 || !isActive())
                return false;
            const data = await blob.arrayBuffer();
            if (!isActive())
                return false;
            const saved = await context.studio.saveHistoryCover(key, sourcePath, data);
            if (!saved || !isActive())
                return false;
            const savedUrl = await context.studio.readHistoryCover(key, sourcePath);
            if (!savedUrl || !isActive())
                return false;
            imageHistoryThumbnailDataUrls.set(key, savedUrl);
            image.src = savedUrl;
            return true;
        }
        catch {
            return false;
        }
    };
    const loadHistoryCardVideo = (media) => {
        const video = media.querySelector("video");
        const source = video?.dataset.historySrc;
        if (!video || !source)
            return video ?? null;
        if (video.dataset.historyLoaded === "true")
            return video;
        media.classList.remove("media-error");
        media.classList.add("media-loading");
        video.src = source;
        video.dataset.historyLoaded = "true";
        video.load();
        return video;
    };
    const setHistoryCoverImage = (media, dataUrl) => {
        const image = media.querySelector("[data-history-cover-image]");
        if (!image || !dataUrl)
            return false;
        const key = media.dataset.coverKey;
        image.hidden = false;
        const showImage = () => {
            if (image.src !== dataUrl || !media.isConnected)
                return;
            image.hidden = false;
            media.dataset.historyCoverCached = "true";
            media.classList.remove("media-loading", "media-error");
            media.classList.add("has-history-cover");
        };
        image.onload = showImage;
        image.onerror = () => {
            if (!media.isConnected || !image.isConnected || image.src !== dataUrl)
                return;
            image.removeAttribute("src");
            media.classList.remove("has-history-cover");
            delete media.dataset.historyCoverCached;
            if (key) {
                historyCoverDataUrls.delete(key);
                historyCoverCacheMisses.delete(key);
            }
            loadHistoryCardVideo(media);
        };
        image.src = dataUrl;
        if (image.complete && image.naturalWidth > 0)
            showImage();
        return true;
    };
    const markHistoryCoverWarmupFailed = (media, signal) => {
        if (signal.aborted || !isHistoryListPage() || !media.isConnected)
            return;
        if (media.dataset.historyCoverCached === "true")
            return;
        media.classList.remove("media-loading");
        media.classList.add("media-error");
    };
    const loadHistoryCoverFromCache = async (media, signal) => {
        const key = media.dataset.coverKey;
        const sourcePath = media.dataset.coverSource;
        if (!key || !sourcePath)
            return false;
        if (signal?.aborted || !media.isConnected)
            return false;
        const cachedInMemory = historyCoverDataUrls.get(key);
        if (cachedInMemory)
            return setHistoryCoverImage(media, cachedInMemory);
        if (historyCoverCacheMisses.has(key))
            return false;
        let read = historyCoverReads.get(key);
        if (!read) {
            read = context.studio.readHistoryCover(key, sourcePath)
                .then((value) => ({ value: value || null, failed: false }))
                .catch((error) => {
                void context.studio.reportRendererError(context.t(uiKeys.history.media.coverReadFailed), {
                    error: error instanceof Error ? error.message : String(error)
                });
                return { value: null, failed: true };
            });
            historyCoverReads.set(key, read);
        }
        try {
            const result = await read;
            if (historyCoverReads.get(key) === read)
                historyCoverReads.delete(key);
            if (!result.value) {
                if (!result.failed)
                    historyCoverCacheMisses.add(key);
                return false;
            }
            if (signal?.aborted || !media.isConnected)
                return false;
            const cached = result.value;
            historyCoverDataUrls.set(key, cached);
            return setHistoryCoverImage(media, cached);
        }
        catch {
            return false;
        }
    };
    const releaseHistoryCardVideo = (media) => {
        const video = media.querySelector("video");
        if (!video || video.dataset.historyLoaded !== "true")
            return;
        video.pause();
        video.removeAttribute("src");
        delete video.dataset.historyLoaded;
        if (media.dataset.historyCoverCached !== "true") {
            media.classList.remove("media-ready");
            media.classList.add("media-loading");
        }
        video.load();
    };
    const historyCoverScore = (video) => {
        if (!video.videoWidth || !video.videoHeight)
            return null;
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 18;
        const canvasContext = canvas.getContext("2d", { willReadFrequently: true });
        if (!canvasContext)
            return null;
        try {
            canvasContext.drawImage(video, 0, 0, canvas.width, canvas.height);
            const pixels = canvasContext.getImageData(0, 0, canvas.width, canvas.height).data;
            let brightnessTotal = 0;
            let brightnessSquaredTotal = 0;
            let saturationTotal = 0;
            for (let index = 0; index < pixels.length; index += 4) {
                const red = pixels[index] ?? 0;
                const green = pixels[index + 1] ?? 0;
                const blue = pixels[index + 2] ?? 0;
                const brightness = red * 0.299 + green * 0.587 + blue * 0.114;
                brightnessTotal += brightness;
                brightnessSquaredTotal += brightness * brightness;
                saturationTotal += Math.max(red, green, blue) - Math.min(red, green, blue);
            }
            const pixelCount = pixels.length / 4;
            const brightnessAverage = brightnessTotal / pixelCount;
            const brightnessVariance = Math.max(0, brightnessSquaredTotal / pixelCount - brightnessAverage * brightnessAverage);
            const saturationAverage = saturationTotal / pixelCount;
            const exposurePenalty = Math.abs(brightnessAverage - 128) * 0.35;
            const unusablePenalty = brightnessAverage < 18 || brightnessAverage > 242 ? 120 : 0;
            return Math.sqrt(brightnessVariance) * 1.5 + saturationAverage * 0.35 - exposurePenalty - unusablePenalty;
        }
        catch {
            return null;
        }
    };
    const historyCoverBlob = (video) => {
        if (!video.videoWidth || !video.videoHeight)
            return Promise.resolve(null);
        const scale = Math.min(1, HISTORY_COVER_MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const canvasContext = canvas.getContext("2d");
        if (!canvasContext)
            return Promise.resolve(null);
        try {
            canvasContext.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
        catch {
            return Promise.resolve(null);
        }
        return new Promise((resolve) => {
            try {
                canvas.toBlob(resolve, "image/jpeg", 0.78);
            }
            catch {
                resolve(null);
            }
        });
    };
    const historyBlobDataUrl = (blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener("load", () => resolve(String(reader.result)));
        reader.addEventListener("error", () => reject(reader.error));
        reader.readAsDataURL(blob);
    });
    const saveHistoryCover = async (media, video, isActive) => {
        const key = media.dataset.coverKey;
        const sourcePath = media.dataset.coverSource;
        if (!key || !sourcePath || !isActive() || media.dataset.historyCoverCached === "true")
            return;
        const frameScore = historyCoverScore(video);
        if (frameScore == null || frameScore < -80)
            return;
        const blob = await historyCoverBlob(video);
        if (!blob || !isActive())
            return;
        const data = await blob.arrayBuffer();
        if (!isActive())
            return;
        try {
            if (!await context.studio.saveHistoryCover(key, sourcePath, data) || !isActive())
                return;
            const dataUrl = await historyBlobDataUrl(blob);
            if (!isActive())
                return;
            historyCoverDataUrls.set(key, dataUrl);
            historyCoverCacheMisses.delete(key);
            setHistoryCoverImage(media, dataUrl);
        }
        catch (error) {
            void context.studio.reportRendererError(context.t(uiKeys.history.media.coverSaveFailed), {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    };
    const waitForHistoryVideoData = (video, signal) => {
        if (signal.aborted || video.readyState >= 2)
            return Promise.resolve(!signal.aborted);
        return new Promise((resolve) => {
            let settled = false;
            const finish = (ready) => {
                if (settled)
                    return;
                settled = true;
                video.removeEventListener("loadeddata", onReady);
                video.removeEventListener("error", onError);
                signal.removeEventListener("abort", onAbort);
                window.clearTimeout(timeout);
                resolve(ready);
            };
            const onReady = () => finish(true);
            const onError = () => finish(false);
            const onAbort = () => finish(false);
            const timeout = window.setTimeout(() => finish(false), 10_000);
            video.addEventListener("loadeddata", onReady, { once: true });
            video.addEventListener("error", onError, { once: true });
            signal.addEventListener("abort", onAbort, { once: true });
            video.load();
        });
    };
    const waitForHistorySeek = (video, time, signal) => new Promise((resolve) => {
        let settled = false;
        let abortHandler;
        let timeout;
        const finish = () => {
            if (settled)
                return;
            settled = true;
            video.removeEventListener("seeked", finish);
            if (abortHandler && signal)
                signal.removeEventListener("abort", abortHandler);
            if (timeout !== undefined)
                window.clearTimeout(timeout);
            resolve();
        };
        abortHandler = finish;
        if (signal?.aborted) {
            finish();
            return;
        }
        timeout = window.setTimeout(finish, 1200);
        video.addEventListener("seeked", finish, { once: true });
        signal?.addEventListener("abort", abortHandler, { once: true });
        try {
            video.currentTime = time;
        }
        catch {
            finish();
        }
    });
    const chooseHistoryCoverTime = async (video, fallbackTime, duration, seed, isActive, signal) => {
        const candidates = historyCoverCandidates(duration, seed);
        let bestTime = fallbackTime;
        let bestScore = null;
        for (const candidate of candidates) {
            if (!isActive())
                return bestTime;
            await waitForHistorySeek(video, candidate, signal);
            if (!isActive())
                return bestTime;
            const score = historyCoverScore(video);
            if (score != null && (bestScore == null || score > bestScore)) {
                bestScore = score;
                bestTime = candidate;
            }
        }
        if (!isActive())
            return bestTime;
        await waitForHistorySeek(video, bestTime, signal);
        return bestTime;
    };
    const warmHistoryCover = async (media, signal) => {
        if (signal.aborted || !isHistoryListPage() || !media.isConnected)
            return false;
        if (media.dataset.historyCoverCached === "true")
            return true;
        const source = media.querySelector("video")?.dataset.historySrc;
        const key = media.dataset.coverKey;
        if (!source || !key)
            return false;
        if (await loadHistoryCoverFromCache(media, signal) || signal.aborted) {
            return media.dataset.historyCoverCached === "true";
        }
        if (media.dataset.historyLoaded === "true" || media.matches(":hover") || media.classList.contains("playing"))
            return false;
        media.classList.remove("media-error");
        media.classList.add("media-loading");
        const video = document.createElement("video");
        video.muted = true;
        video.crossOrigin = "anonymous";
        video.preload = "auto";
        video.src = source;
        let coverSaved = false;
        try {
            if (!await waitForHistoryVideoData(video, signal) || signal.aborted)
                return false;
            const duration = Number(media.dataset.previewDuration) || video.duration;
            const fallbackTime = Number(media.dataset.coverTime) || 0;
            const seed = Number(media.dataset.coverSeed) || 0;
            const isActive = () => !signal.aborted &&
                isHistoryListPage() &&
                media.isConnected &&
                !media.matches(":hover") &&
                !media.classList.contains("playing");
            const selectedTime = await chooseHistoryCoverTime(video, fallbackTime, duration, seed, isActive, signal);
            if (!isActive())
                return false;
            media.dataset.coverTime = String(selectedTime);
            await saveHistoryCover(media, video, isActive);
            coverSaved = historyCoverDataUrls.has(key);
            return coverSaved;
        }
        finally {
            video.pause();
            video.removeAttribute("src");
            video.load();
            if (!coverSaved)
                markHistoryCoverWarmupFailed(media, signal);
        }
    };
    const stopHistoryCoverWarmup = () => {
        historyCoverScheduler.clear();
    };
    const scheduleHistoryCoverWarmup = (mediaCards, priority = "viewport") => {
        mediaCards.forEach((media) => {
            const key = media.dataset.coverKey?.trim();
            if (!key)
                return;
            historyCoverScheduler.enqueue(key, (signal) => warmHistoryCover(media, signal), priority);
        });
    };
    const cancelHistoryCoverWarmup = (media) => {
        const key = media.dataset.coverKey?.trim();
        if (key)
            historyCoverScheduler.cancel(key);
    };
    return {
        loadImageHistoryThumbnail,
        loadHistoryCoverFromCache,
        loadHistoryCardVideo,
        releaseHistoryCardVideo,
        scheduleHistoryCoverWarmup,
        cancelHistoryCoverWarmup,
        stopHistoryCoverWarmup,
        chooseHistoryCoverTime,
        saveHistoryCover,
        clearImageHistoryThumbnailCache: () => imageHistoryThumbnailDataUrls.clear()
    };
}
