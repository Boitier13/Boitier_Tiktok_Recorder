# Identité visuelle BTL

L’emblème caméra cyan fourni (PNG avec transparence, sans arrière-plan intégré) est décliné sous `frontend/public/brand/` :

- `btl-windows.png` (256 × 256) : icône Windows, fenêtre et zone de notification.
- `btl-logo-primary.png` (512 × 512) : emblème affiché dans la section « À propos de BTL ».
- `btl-logo-compact.png` (256 × 256) : emblème affiché dans l’en-tête de l’interface.

Les variantes ICO multi-résolutions correspondantes sont `btl-windows.ico` et `btl-logo-compact.ico` (16 à 256 px). Le premier sert à l’EXE, au favicon et à l’icône de notification; le second aux raccourcis du menu Démarrer et de démarrage automatique. Le paquet Windows embarque ces ressources dans `brand/` afin que l’icône de démarrage automatique reste disponible après installation. `frontend/public/favicon.ico` reprend l’icône Windows.
