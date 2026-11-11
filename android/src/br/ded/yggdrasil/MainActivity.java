package br.ded.yggdrasil;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

public class MainActivity extends Activity {
    private static final int FUNDO = 0xFF2A2321;
    private static final int CARD = 0xFF2E2623;
    private static final int TEXTO = 0xFFECE3DA;
    private static final int FRACO = 0xFFA8968A;
    private static final int ACENTO = 0xFFD9834B;
    private static final int PEDIDO_ARQUIVO = 7;

    private WebView web;
    private ValueCallback<Uri[]> escolhaArquivo;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private boolean mostrandoWeb;

    @Override
    protected void onCreate(Bundle salvo) {
        super.onCreate(salvo);
        getWindow().setStatusBarColor(FUNDO);
        getWindow().setNavigationBarColor(FUNDO);
        Avisos.canais(this);
        Avisos.agendar(this);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 1);
        }
        if (Avisos.url(this).isEmpty()) mostrarConfig(null);
        else mostrarWeb(hashDe(getIntent()));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String hash = hashDe(intent);
        if (hash != null && web != null && mostrandoWeb) {
            web.evaluateJavascript("location.hash=" + org.json.JSONObject.quote(hash), null);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        verificarAgora();
    }

    private static String hashDe(Intent i) {
        return i == null ? null : i.getStringExtra("hash");
    }

    private void verificarAgora() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                Avisos.verificar(MainActivity.this);
            }
        }).start();
    }

    // ---------------- Yggdrasil ----------------

    private void mostrarWeb(String hash) {
        if (web == null) {
            web = new WebView(this);
            web.setBackgroundColor(FUNDO);
            WebSettings s = web.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setDatabaseEnabled(true);
            s.setMediaPlaybackRequiresUserGesture(false);
            s.setUserAgentString(s.getUserAgentString() + " YggdrasilApp/1");
            web.addJavascriptInterface(new Ponte(), "YggApp");
            web.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView v, String url) {
                    if (url.startsWith(Avisos.url(MainActivity.this))) return false;
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    } catch (Exception e) {
                        // nenhum app abre esse link
                    }
                    return true;
                }

                @Override
                public void onReceivedError(WebView v, int codigo, String descricao, String url) {
                    mostrarConfig("Não achei o Yggdrasil em " + Avisos.url(MainActivity.this)
                            + ".\n\nO celular está no wifi de casa? O PC está ligado com o Yggdrasil aberto?");
                }
            });
            web.setWebChromeClient(new WebChromeClient() {
                @Override
                public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                    if (escolhaArquivo != null) escolhaArquivo.onReceiveValue(null);
                    escolhaArquivo = cb;
                    try {
                        startActivityForResult(params.createIntent(), PEDIDO_ARQUIVO);
                    } catch (Exception e) {
                        escolhaArquivo = null;
                        return false;
                    }
                    return true;
                }
            });
        }
        mostrandoWeb = true;
        setContentView(web);
        String url = Avisos.url(this) + (hash != null ? hash : "");
        web.loadUrl(url);
    }

    @Override
    protected void onActivityResult(int pedido, int resultado, Intent dados) {
        if (pedido == PEDIDO_ARQUIVO && escolhaArquivo != null) {
            escolhaArquivo.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultado, dados));
            escolhaArquivo = null;
            return;
        }
        super.onActivityResult(pedido, resultado, dados);
    }

    @Override
    public void onBackPressed() {
        if (mostrandoWeb && web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        if (!mostrandoWeb && !Avisos.url(this).isEmpty() && web != null) {
            mostrarWeb(null);
            return;
        }
        super.onBackPressed();
    }

    /** Chamado pelo app.js (window.YggApp). */
    private class Ponte {
        @JavascriptInterface
        public void perfil(String id, String pin) {
            SharedPreferences p = Avisos.prefs(MainActivity.this);
            String antigo = p.getString("perfil", "");
            SharedPreferences.Editor e = p.edit().putString("perfil", id == null ? "principal" : id).putString("pin", pin == null ? "" : pin);
            if (!antigo.equals(id)) e.remove("emailsBase").remove("emailsVistos").remove("compiladoVisto").remove("eventosAvisados");
            e.apply();
            verificarAgora();
        }

        @JavascriptInterface
        public void configurar() {
            ui.post(new Runnable() {
                @Override
                public void run() {
                    mostrarConfig(null);
                }
            });
        }

        @JavascriptInterface
        public String status() {
            return Avisos.prefs(MainActivity.this).getString("status", "");
        }

        @JavascriptInterface
        public String versao() {
            return "1";
        }
    }

    // ---------------- tela de configuração ----------------

    private int dp(float v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private TextView texto(String s, float tam, int cor) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(tam);
        t.setTextColor(cor);
        t.setLineSpacing(0, 1.15f);
        return t;
    }

    private Button botao(String s, boolean primario) {
        Button b = new Button(this);
        b.setText(s);
        b.setAllCaps(false);
        b.setTextColor(primario ? FUNDO : TEXTO);
        GradientDrawable g = new GradientDrawable();
        g.setCornerRadius(dp(10));
        g.setColor(primario ? ACENTO : CARD);
        g.setStroke(dp(1.5f), ACENTO);
        b.setBackground(g);
        b.setPadding(dp(16), dp(12), dp(16), dp(12));
        return b;
    }

    private LinearLayout.LayoutParams margem(int topo) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(topo);
        return lp;
    }

    private void mostrarConfig(String erro) {
        mostrandoWeb = false;
        ScrollView rolagem = new ScrollView(this);
        rolagem.setBackgroundColor(FUNDO);
        rolagem.setFillViewport(true);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(24), dp(40), dp(24), dp(24));
        rolagem.addView(col);

        TextView titulo = texto("Yggdrasil", 30, Color.WHITE);
        titulo.setTypeface(android.graphics.Typeface.MONOSPACE, android.graphics.Typeface.BOLD);
        col.addView(titulo);
        col.addView(texto("Links, agenda, tarefas e email do seu PC, com avisos no celular.", 14, FRACO), margem(6));

        if (erro != null) {
            TextView e = texto(erro, 14, 0xFFF0BF86);
            GradientDrawable g = new GradientDrawable();
            g.setCornerRadius(dp(10));
            g.setColor(0xFF43352F);
            e.setBackground(g);
            e.setPadding(dp(14), dp(12), dp(14), dp(12));
            col.addView(e, margem(20));
        }

        col.addView(texto("Endereço do Yggdrasil no PC", 14, TEXTO), margem(24));
        col.addView(texto("Aparece no terminal do servidor como \"Na rede: http://192.168.…:8090/\". Pode digitar só o número (ex.: 192.168.0.10).", 12.5f, FRACO), margem(4));
        final EditText campo = new EditText(this);
        campo.setSingleLine(true);
        campo.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        campo.setTextColor(Color.WHITE);
        campo.setHintTextColor(FRACO);
        campo.setHint("192.168.0.10");
        String atual = Avisos.url(this);
        campo.setText(atual.isEmpty() ? "" : atual);
        GradientDrawable fundoCampo = new GradientDrawable();
        fundoCampo.setCornerRadius(dp(10));
        fundoCampo.setColor(CARD);
        fundoCampo.setStroke(dp(1.5f), 0xFF4D3C34);
        campo.setBackground(fundoCampo);
        campo.setPadding(dp(14), dp(12), dp(14), dp(12));
        col.addView(campo, margem(10));

        final TextView msg = texto("", 13, 0xFFF0BF86);
        msg.setVisibility(View.GONE);
        col.addView(msg, margem(10));

        Button conectar = botao("Conectar", true);
        col.addView(conectar, margem(14));
        conectar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                final String url = Avisos.normalizar(campo.getText().toString());
                if (url.isEmpty()) {
                    msg.setText("Digite o endereço que aparece no PC.");
                    msg.setVisibility(View.VISIBLE);
                    return;
                }
                msg.setText("Procurando o Yggdrasil em " + url + "…");
                msg.setTextColor(FRACO);
                msg.setVisibility(View.VISIBLE);
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        final String antigo = Avisos.url(MainActivity.this);
                        Avisos.prefs(MainActivity.this).edit().putString("url", url).commit();
                        boolean ok;
                        try {
                            ok = Avisos.buscar(MainActivity.this, "api/perfis").contains("perfis");
                        } catch (Exception e) {
                            ok = false;
                        }
                        final boolean deu = ok;
                        if (!deu) Avisos.prefs(MainActivity.this).edit().putString("url", antigo).commit();
                        ui.post(new Runnable() {
                            @Override
                            public void run() {
                                if (deu) {
                                    if (web != null && !url.equals(antigo)) {
                                        web.destroy();
                                        web = null;
                                    }
                                    mostrarWeb(null);
                                } else {
                                    msg.setTextColor(0xFFF0BF86);
                                    msg.setText("Não respondeu. Confira o endereço, se o celular está no mesmo wifi e se o Yggdrasil está aberto no PC.");
                                }
                            }
                        });
                    }
                }).start();
            }
        });

        if (!atual.isEmpty()) {
            Button tentar = botao("Tentar de novo", false);
            col.addView(tentar, margem(10));
            tentar.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    if (web != null) web.reload();
                    mostrarWeb(null);
                }
            });
        }

        col.addView(texto("Avisos em segundo plano", 14, TEXTO), margem(30));
        col.addView(texto("O app confere o PC a cada 15 minutos mais ou menos, mesmo fechado, e avisa de email novo, compromisso chegando e o compilado das 6h. Só funciona quando o celular está no mesmo wifi do PC.", 12.5f, FRACO), margem(4));
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
            Button bateria = botao("Não deixar o Android pausar os avisos", false);
            col.addView(bateria, margem(12));
            bateria.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    try {
                        startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName())));
                    } catch (Exception e) {
                        startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
                    }
                }
            });
        } else {
            col.addView(texto("✓ O Android não vai pausar os avisos.", 12.5f, 0xFF9DB0A8), margem(10));
        }
        String status = Avisos.prefs(this).getString("status", "");
        if (!status.isEmpty()) col.addView(texto("Última verificação: " + status, 12, FRACO), margem(14));

        TextView rodape = texto("", 1, FUNDO);
        rodape.setGravity(Gravity.CENTER);
        col.addView(rodape, margem(20));
        setContentView(rolagem);
    }
}
