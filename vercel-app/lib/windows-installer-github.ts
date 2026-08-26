/** Git 에 올라간 설치본 — Vercel은 .exe 를 배포하지 않음(.vercelignore). */
export const WINDOWS_INSTALLER_GITHUB_PUBLIC_RAW =
  'https://raw.githubusercontent.com/jjswsc/Choongman-ERP/main/vercel-app/public'

export function githubRawPublicFileUrl(pathname: string): string {
  const p = `/${String(pathname || '').replace(/^\/+/, '').replace(/\\/g, '/')}`
  if (p.includes('..') || !p.startsWith('/downloads/') || !p.toLowerCase().endsWith('.exe')) {
    return ''
  }
  return `${WINDOWS_INSTALLER_GITHUB_PUBLIC_RAW}${p}`
}

/** 충만 호스트에서 Omni 파일명을 충만 설치본으로 맞춤 (middleware rewrite 와 동일). */
export function choongmanWindowsPosDownloadPath(pathname: string): string {
  if (pathname === '/downloads/windows-pos/latest.json') {
    return '/downloads/windows-pos/latest-choongman.json'
  }
  if (pathname === '/downloads/windows-pos/cm-pos-windows-latest-setup.exe') {
    return '/downloads/windows-pos/cm-pos-windows-choongman-latest-setup.exe'
  }
  if (pathname === '/downloads/windows-pos/cm-pos-windows-latest-portable.exe') {
    return '/downloads/windows-pos/cm-pos-windows-choongman-latest-portable.exe'
  }
  const versioned = pathname.match(
    /^\/downloads\/windows-pos\/cm-pos-windows-(\d+\.\d+\.\d+)-(setup|portable)\.exe$/
  )
  if (versioned) {
    const ver = versioned[1]
    const kind = versioned[2]
    return `/downloads/windows-pos/cm-pos-windows-choongman-${ver}-${kind}.exe`
  }
  return pathname
}
