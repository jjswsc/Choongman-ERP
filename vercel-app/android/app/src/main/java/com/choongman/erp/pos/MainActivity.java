package com.choongman.erp.pos;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CmNativeAppPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
