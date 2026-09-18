# Direction design — UI Review

## Lead validé : « Editorial margin notes »

Référence visuelle : `docs/design/sidebar-b-editorial.png` (direction retenue).
Explorations conservées pour itération ultérieure : `sidebar-a-rail.png` (rail spatial),
`sidebar-c-console.png` (console sombre).

Principe : le side panel se lit comme la **marge annotée d'un document imprimé**, pas comme un
dashboard. Papier crème, filets fins à la place des cartes, gros index numérotés, hiérarchie
typographique forte, preuves présentées comme des planches légendées.

Cette direction est un **lead**, pas une spec pixel-perfect : elle sera itérée plus tard. Tout
ticket UI doit s'y conformer en esprit (voir règles ci-dessous).

## Tokens (cibles)

| Rôle | Valeur indicative |
|---|---|
| Fond papier | `#F6F1E7` (crème chaud) |
| Encre principale | `#1F1D1A` (quasi noir) |
| Accent index / marque | `#6E2130` (oxblood) |
| Action primaire | `#223E5C` (bleu encre) |
| Succès | `#3E8E5A` |
| Priorité P2 | `#C97A2B` (ambre) |
| Filets / séparateurs | `#D8CFC0` |
| Méta / texte discret | `#8A8175` |

Typo : titres en serif éditorial (empiler une serif système ou embarquée légère :
Iowan Old Style / Palatino / Georgia), corps en sans système, métadonnées en monospace
capitales espacées.

## Composants

- **Ligne de commentaire** : grand numéro d'index (01, 02…), titre serif, corps, ligne méta
  `CATÉGORIE · P1|P2|P3`, miniature de preuve optionnelle. Séparées par des filets 1 px,
  pas de cartes flottantes.
- **Preuves** : planches légendées `Fig. 1 · Viewport`, `Fig. 2 · Element crop`, avec
  suppression indépendante.
- **Composer** : `ADD A NOTE`, champ principal, selects catégorie/priorité, action
  `Save note` (bleu encre).
- **Badge de confiance** : pastille discrète, honnête (`React context: best effort`).
- **Footer** : `Copy brief` bien visible + mention artefacts locaux/temporaires.

## Règles

- Interdit : dégradés, glassmorphism, ombres lourdes, coins très arrondis (radius max 2-4 px),
  emoji, look dashboard/Bootstrap/Material générique, lorem ipsum.
- Filets et alignement strict plutôt que bordures épaisses et élévation.
- Une seule signification par accent couleur (ambre = priorité, vert = succès, oxblood = index).
- Accessibilité : contraste AA, focus visibles, tout au clavier (acceptance criteria du projet).
- Textes d'interface en **anglais** ; code, docs et commentaires en anglais également.
- Reste implémentable en side panel Chrome sans framework UI lourd.
