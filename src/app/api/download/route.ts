import { NextResponse } from 'next/server';

const GITHUB_OWNER = 'calebohara';
const GITHUB_REPO = 'Portable-BAS-Toolkit';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') || 'msi'; // msi or exe

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      {
        headers: { Accept: 'application/vnd.github.v3+json' },
        next: { revalidate: 300 }, // cache for 5 minutes
      }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Could not fetch latest release' },
        { status: 502 }
      );
    }

    const release = await res.json();
    const assets: { name: string; browser_download_url: string }[] = release.assets || [];

    // Find the right asset by format
    const asset = assets.find((a) =>
      format === 'exe'
        ? a.name.endsWith('-setup.exe') && !a.name.endsWith('.sig')
        : a.name.endsWith('.msi') && !a.name.endsWith('.sig')
    );

    if (!asset) {
      return NextResponse.json(
        { error: `No ${format} installer found in latest release` },
        { status: 404 }
      );
    }

    // Redirect to the direct download URL
    return NextResponse.redirect(asset.browser_download_url, 302);
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch download link' },
      { status: 500 }
    );
  }
}
