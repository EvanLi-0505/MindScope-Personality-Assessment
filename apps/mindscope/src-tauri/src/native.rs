//! Native Windows dialogs for problems that happen before the UI exists
//! (folder not writable, WebView2 runtime missing).

#[cfg(windows)]
mod imp {
    use webview2_com::Microsoft::Web::WebView2::Win32::GetAvailableCoreWebView2BrowserVersionString;
    use windows::core::{HSTRING, PCWSTR, PWSTR};
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::{
        MessageBoxW, IDYES, MB_ICONERROR, MB_ICONWARNING, MB_OK, MB_YESNO, SW_SHOWNORMAL,
    };

    pub fn error_box(title: &str, text: &str) {
        unsafe {
            MessageBoxW(None, &HSTRING::from(text), &HSTRING::from(title), MB_OK | MB_ICONERROR);
        }
    }

    pub fn ask_yes_no(title: &str, text: &str) -> bool {
        unsafe { MessageBoxW(None, &HSTRING::from(text), &HSTRING::from(title), MB_YESNO | MB_ICONWARNING) == IDYES }
    }

    pub fn open_url(url: &str) {
        unsafe {
            ShellExecuteW(None, &HSTRING::from("open"), &HSTRING::from(url), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL);
        }
    }

    /// Installed WebView2 runtime version, or None when it is missing.
    pub fn webview2_version() -> Option<String> {
        unsafe {
            let mut v = PWSTR::null();
            GetAvailableCoreWebView2BrowserVersionString(PCWSTR::null(), &mut v).ok()?;
            if v.is_null() {
                return None;
            }
            let s = v.to_string().ok();
            CoTaskMemFree(Some(v.0 as *const _));
            s
        }
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn error_box(title: &str, text: &str) {
        eprintln!("{title}: {text}");
    }
    pub fn ask_yes_no(_: &str, _: &str) -> bool {
        false
    }
    pub fn open_url(_: &str) {}
    pub fn webview2_version() -> Option<String> {
        Some("n/a".into())
    }
}

pub use imp::*;

pub const WEBVIEW2_DOWNLOAD_URL: &str = "https://developer.microsoft.com/microsoft-edge/webview2/";
