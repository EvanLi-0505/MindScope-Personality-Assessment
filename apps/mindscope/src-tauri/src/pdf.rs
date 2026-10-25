//! PDF export through WebView2's native `PrintToPdf`: the current page is
//! printed with its print stylesheet, using system fonts (so Chinese text
//! needs no bundled font) and vector SVG charts.

use std::path::PathBuf;
use std::time::Duration;

#[cfg(windows)]
pub async fn print_to_pdf(window: &tauri::WebviewWindow, path: PathBuf) -> Result<(), String> {
    use std::sync::mpsc;
    use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2Environment6, ICoreWebView2_7};
    use webview2_com::PrintToPdfCompletedHandler;
    use windows::core::{Interface, HSTRING};

    let (tx, rx) = mpsc::channel::<Result<(), String>>();
    let tx_start = tx.clone();
    let target = HSTRING::from(path.to_string_lossy().as_ref());

    // with_webview runs on the UI thread; the completion handler fires there later.
    window
        .with_webview(move |wv| {
            let started = (|| -> windows::core::Result<()> {
                unsafe {
                    let core = wv.controller().CoreWebView2()?;
                    let core7: ICoreWebView2_7 = core.cast()?;
                    let env6: ICoreWebView2Environment6 = wv.environment().cast()?;
                    let settings = env6.CreatePrintSettings()?;
                    settings.SetShouldPrintBackgrounds(true)?;
                    settings.SetShouldPrintHeaderAndFooter(false)?;
                    settings.SetPageWidth(8.27)?; // A4, inches
                    settings.SetPageHeight(11.69)?;
                    let done = tx.clone();
                    let handler = PrintToPdfCompletedHandler::create(Box::new(move |result, ok| {
                        let _ = done.send(match (result, ok) {
                            (Ok(()), true) => Ok(()),
                            (Err(e), _) => Err(e.message()),
                            (Ok(()), false) => Err("WebView2 PrintToPdf reported failure".into()),
                        });
                        Ok(())
                    }));
                    core7.PrintToPdf(&target, &settings, &handler)
                }
            })();
            if let Err(e) = started {
                let _ = tx_start.send(Err(e.message()));
            }
        })
        .map_err(|e| e.to_string())?;

    // Wait off the UI thread so the handler can run.
    tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(Duration::from_secs(90)))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|_| "PDF export timed out".to_string())?
}

#[cfg(not(windows))]
pub async fn print_to_pdf(_window: &tauri::WebviewWindow, _path: PathBuf) -> Result<(), String> {
    let _ = Duration::from_secs(0);
    Err("Native PDF export is only implemented on Windows".into())
}
