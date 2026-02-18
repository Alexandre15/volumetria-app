# Volumetria de Veículo 3D (PHP + Three.js)

Aplicativo para montar cargas e visualizar a **cubagem em 3D** com **Three.js**. Persistência em **JSON** via PHP.

## Novidades
- **Interface melhorada** (topbar, toasts, stats coladas ao painel).
- **Cadastro de embalagens em página separada** (`packages.html`).
- **Adição incremental**: ao adicionar/remover itens, o caminhão é **atualizado automaticamente** (sem botão de distribuir).
- **Salvar carga** em `data/loads.json`.
- **Exportar imagem** do 3D (PNG).
- **Gerenciar veículos** (adicionar/excluir) pela UI de embalagens.

## Como executar
```bash
php -S localhost:8000 -t .
```
Acesse:
- App (carga): http://localhost:8000/index.html
- Embalagens: http://localhost:8000/packages.html

## Three.js não aparece?
Por padrão, carregamos do CDN (unpkg). Se estiver offline ou bloqueado:
1. Baixe:
   - `three.min.js`: https://unpkg.com/three@0.158.0/build/three.min.js
   - `OrbitControls.js`: https://unpkg.com/three@0.158.0/examples/js/controls/OrbitControls.js
2. Coloque os dois arquivos na pasta `vendor/`.
3. **Descomente** as duas linhas "Fallback local" no `<head>` do `index.html` para usar os arquivos locais.

## Unidades
- Medidas em **metros (m)**; peso em **kg**; volume em **m³**.

## Heurística de empacotamento
- Lista de espaços livres (guilhotina) + orientação quando permitido.
- Espaços gerados à direita, frente e (se empilhável) acima.
- *Merge* simples de espaços adjacentes.

> Observação: é uma heurística (pode não ser ótimo global). Melhorias futuras: extreme points, zoning por pedido, limites por camada, balanceamento por eixo, etc.
