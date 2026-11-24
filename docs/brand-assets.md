# Identité visuelle BTL

Les trois sources PNG reçues sont conservées sous `frontend/public/brand/` :

- `btl-windows.png` : symbole seul, utilisé pour l’EXE Windows, l’icône de fenêtre et la zone de notification.
- `btl-logo-primary.png` : logo complet, affiché dans la section « À propos de BTL » et prévu pour les présentations et une éventuelle page web.
- `btl-logo-compact.png` : signature horizontale, affichée dans l’en-tête de l’interface et utilisée pour les raccourcis Windows.

Les variantes ICO multi-résolutions correspondantes sont `btl-windows.ico` et `btl-logo-compact.ico`. Le premier sert à l’EXE et au favicon; le second aux raccourcis du menu Démarrer et de démarrage automatique. Le paquet Windows embarque aussi ces ressources dans `brand/` afin que l’icône de démarrage automatique reste disponible après installation.
