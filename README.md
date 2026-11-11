# Yggdrasil

Painel pessoal que roda no seu computador: links, agenda, tarefas, notas e email (Outlook, Gmail e outros por IMAP), com compilado diário das newsletters feito por IA (Gemini), temas claros e escuros e um app Android que avisa de email novo e compromissos.

Tudo fica no seu PC. Não há conta, servidor central nem rastreamento. Veja [PRIVACIDADE.md](PRIVACIDADE.md).

## Como instalar

Precisa só de Python 3.9 ou mais novo (sem instalar pacotes). Baixe o .zip da última versão e extraia numa pasta sua.

| Sistema | Como |
| --- | --- |
| Windows | Dois cliques em `windows\instalar.bat` (cria os atalhos e ajuda a instalar o Python se faltar) |
| Linux | `bash linux/instalar.sh` (atalho no menu; `--iniciar-junto` sobe junto com o sistema) |
| macOS | Dois cliques em `mac/Yggdrasil.command` |
| Qualquer um | `python3 servidor.py --abrir` |

Abre em `http://localhost:8090/`. O guia completo, em português, está em [LEIA-ME.txt](LEIA-ME.txt).

## Configuração opcional

**Celular e outros aparelhos.** Por padrão só o próprio PC abre o Yggdrasil. Para abrir no celular, ligue em Ajustes > Endereços (ou rode com `YGG_REDE=1`) e reinicie o servidor. A conexão na rede é http sem criptografia: use só em rede de confiança. Para ligar a rede, todo perfil precisa de PIN (6 a 8 números), e pela rede perfil sem PIN não abre.

**Outlook.** Registre um app seu no [Microsoft Entra](https://entra.microsoft.com) (App registrations > New registration):
- tipos de conta: "contas pessoais e organizacionais";
- em Authentication, ligue "Allow public client flows";
- permissões delegadas do Microsoft Graph: `User.Read`, `Mail.ReadWrite`, `Mail.Send`, `offline_access`.

Depois crie `email-config.json` na pasta do Yggdrasil:

```json
{"client_id": "SEU-CLIENT-ID", "tenant": "common"}
```

**Gmail, Yahoo, iCloud e outros.** Em Email > "+ Gmail e outros", use uma senha de app do seu provedor.

**Compilado das newsletters.** Em Ajustes, cole uma chave da [Gemini API](https://aistudio.google.com/apikey) de um projeto **com faturamento ativo**. Os termos da API proíbem enviar dados pessoais, como emails, no uso gratuito.

**App Android.** O código está em `android/` e compila com `android/compilar.sh`, sem Android Studio. Você precisa da sua própria chave de assinatura. No Brasil, desde 30/09/2026, APK fora da Play Store só instala normalmente se o desenvolvedor estiver registrado no Android Developer Console.

## Segurança

- Os dados e segredos ficam em arquivos JSON na pasta. No Linux e no macOS os segredos têm permissão `600`. No Windows não há essa proteção.
- O servidor nunca entrega pelo navegador os arquivos de dados, de segredos, de backups nem de outros perfis, e não lista pastas.
- Para escrever, o pedido precisa do cabeçalho `X-Yggdrasil` e da origem certa (proteção contra CSRF). O nome do host também é conferido (contra DNS rebinding).
- O email é mostrado num iframe isolado, sem scripts, e as imagens remotas só carregam se você pedir.

Achou uma falha? Mande para **ded.beed@outlook.com**, sem publicar os detalhes antes.

## Contato

Dúvidas, ideias e problemas: ded.beed@outlook.com

## Licença

[MIT](LICENSE). Créditos de terceiros em [CREDITOS.md](CREDITOS.md).
