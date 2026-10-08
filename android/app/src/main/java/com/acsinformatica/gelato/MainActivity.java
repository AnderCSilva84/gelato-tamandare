package com.acsinformatica.gelato;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(NaviaPrinterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
