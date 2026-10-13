package com.choongman.erp.pos;

import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 첫 WebView 생성 전에만 유효. 없으면 화면보다 긴 영수증을 비트맵으로 그릴 때 아래쪽이 비어 나온다.
        WebView.enableSlowWholeDocumentDraw();
        registerPlugin(CmNativeAppPlugin.class);
        registerPlugin(CmThermalPrinterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
