export function slugify(input: string) {
    return (input || "")
        .trim()
        .toLowerCase()
        .replace(/\.pdf$/i, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80);
}
