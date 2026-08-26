import { describe, expect, it } from 'vitest'
import {
  isLocalDevHost,
  resolveWindowsInstallerUrl,
  WINDOWS_POS_CHOONGMAN_SETUP_PATH,
  WINDOWS_POS_OMNI_SETUP_PATH,
  windowsPosSetupPathForBrand,
} from '@/lib/windows-installer-copy'
import {
  choongmanWindowsPosDownloadPath,
  githubRawPublicFileUrl,
} from '@/lib/windows-installer-github'

describe('windowsPosSetupPathForBrand', () => {
  it('maps Omni brand to Omni installer path', () => {
    expect(windowsPosSetupPathForBrand('omnifoodtech')).toBe(WINDOWS_POS_OMNI_SETUP_PATH)
  })

  it('maps Choongman brand to Choongman installer path', () => {
    expect(windowsPosSetupPathForBrand('choongman')).toBe(WINDOWS_POS_CHOONGMAN_SETUP_PATH)
  })
})

describe('isLocalDevHost', () => {
  it('detects localhost variants', () => {
    expect(isLocalDevHost('localhost')).toBe(true)
    expect(isLocalDevHost('127.0.0.1')).toBe(true)
    expect(isLocalDevHost('app.omnifoodtech.com')).toBe(false)
  })
})

describe('githubRawPublicFileUrl', () => {
  it('maps public download path to GitHub raw', () => {
    expect(githubRawPublicFileUrl('/downloads/windows-pos/cm-pos-windows-choongman-0.1.17-setup.exe')).toBe(
      'https://raw.githubusercontent.com/jjswsc/Choongman-ERP/main/vercel-app/public/downloads/windows-pos/cm-pos-windows-choongman-0.1.17-setup.exe'
    )
  })

  it('rejects path traversal', () => {
    expect(githubRawPublicFileUrl('/downloads/../secret.exe')).toBe('')
  })
})

describe('choongmanWindowsPosDownloadPath', () => {
  it('maps Omni setup filename to Choongman installer', () => {
    expect(choongmanWindowsPosDownloadPath('/downloads/windows-pos/cm-pos-windows-latest-setup.exe')).toBe(
      '/downloads/windows-pos/cm-pos-windows-choongman-latest-setup.exe'
    )
  })
})

describe('resolveWindowsInstallerUrl', () => {
  it('defaults Choongman setup to GitHub raw when env is unset', () => {
    expect(resolveWindowsInstallerUrl(WINDOWS_POS_CHOONGMAN_SETUP_PATH)).toBe(
      'https://raw.githubusercontent.com/jjswsc/Choongman-ERP/main/vercel-app/public/downloads/windows-pos/cm-pos-windows-choongman-latest-setup.exe'
    )
  })
})
