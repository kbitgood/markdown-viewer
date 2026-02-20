import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BUILD_DIR = join(process.cwd(), "build");

function findAppBundle(dir: string): string | null {
  if (!existsSync(dir)) {
    return null;
  }

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.endsWith(".app")) {
      return join(dir, entry.name);
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const nested = findAppBundle(join(dir, entry.name));
    if (nested) {
      return nested;
    }
  }

  return null;
}

function patchPlist(plistPath: string): boolean {
  const plist = readFileSync(plistPath, "utf8");

  if (plist.includes("CFBundleDocumentTypes") && plist.includes("net.daringfireball.markdown")) {
    return false;
  }

  const markerRegex = /<\/dict>\s*<\/plist>\s*$/;
  if (!markerRegex.test(plist)) {
    throw new Error(`Unexpected plist format at ${plistPath}`);
  }

  const documentTypes = `
  <key>CFBundleDocumentTypes</key>
  <array>
    <dict>
      <key>CFBundleTypeName</key>
      <string>Markdown Document</string>
      <key>CFBundleTypeRole</key>
      <string>Viewer</string>
      <key>LSHandlerRank</key>
      <string>Owner</string>
      <key>LSItemContentTypes</key>
      <array>
        <string>net.daringfireball.markdown</string>
        <string>public.plain-text</string>
      </array>
      <key>CFBundleTypeExtensions</key>
      <array>
        <string>md</string>
        <string>markdown</string>
        <string>mdown</string>
        <string>mkd</string>
      </array>
    </dict>
  </array>
`;

  const patched = plist.replace(markerRegex, `${documentTypes}\n</dict>\n</plist>\n`);
  if (!patched.includes("CFBundleDocumentTypes")) {
    throw new Error(`Failed to inject CFBundleDocumentTypes into ${plistPath}`);
  }

  writeFileSync(plistPath, patched, "utf8");
  return true;
}

const appBundle = findAppBundle(BUILD_DIR);
if (!appBundle) {
  console.error("No .app bundle found under build/. Run `bun run build` first.");
  process.exit(1);
}

const plistPath = join(appBundle, "Contents", "Info.plist");
if (!existsSync(plistPath)) {
  console.error(`Info.plist not found at ${plistPath}`);
  process.exit(1);
}

const changed = patchPlist(plistPath);
if (changed) {
  console.log(`Patched markdown file associations into ${plistPath}`);
} else {
  console.log(`Info.plist already includes markdown file associations.`);
}
