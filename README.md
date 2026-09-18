# UI Review

Une extension Chrome locale pour faire une review d'interface directement sur une page : survoler, cliquer, poser une pin, écrire une remarque, puis copier un brief exploitable par un agent de code.

## Principes non négociables

- **Zéro friction de review** : un mode explicite, `hover → click → comment`, des pins persistantes et un panneau latéral clair.
- **Local-first** : aucune donnée ne quitte la machine. Les reviews restent locales jusqu'au clear manuel.
- **Preuves utiles, jamais trompeuses** : DOM, captures et métadonnées framework sont accompagnés d'un niveau de confiance ; une détection React/Vue ou une source map n'est jamais présentée comme certaine sans preuve.
- **Données sensibles protégées** : aucune valeur de formulaire ou secret connu n'est exporté ; les captures restent prévisualisables et supprimables avant handoff.
- **Agent-ready** : un seul copier-coller produit un brief Markdown et pointe vers les artefacts locaux. L'agent traite les pins identifiés et restitue une réponse par identifiant.

## Architecture

Le noyau de domaine reste indépendant de Chrome, du DOM et des frameworks. Les intégrations sont des adaptateurs : Chrome MV3, persistance locale, Native Messaging, DOM générique, React/Next puis Vue/Nuxt, et résolution de source maps. Les interfaces publiques sont étroites et testées au même seam que les appels réels.

Le bridge local utilise Chrome Native Messaging, jamais un serveur HTTP local. Il conserve les artefacts durablement dans le dossier applicatif de l'OS et matérialise un handoff temporaire pour l'agent dans `/tmp` sur macOS ou l'équivalent Windows.

## Roadmap

Les 11 tickets MVP sont publiés dans les [issues](https://github.com/DabiK/ui-review/issues). Ils forment un DAG : commencer par [#1 — clean architecture et workflow agent](https://github.com/DabiK/ui-review/issues/1), puis débloquer les tranches verticales.

Chaque ticket impose un implémenteur agent isolé et une review par un second agent, avec critères d'acceptation vérifiables.
Local-first Chrome UI review annotations with agent-ready handoff
