export function slugify(input: string) {
    const out = (input || "")
        .trim()
        .toLowerCase()
        .replace(/\.pdf$/i, "")
        .replace(/[\\\r\n]+/g, " ")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80);
    return out || "document";
}
