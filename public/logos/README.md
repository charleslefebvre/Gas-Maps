# Brand logos

Drop licensed brand logo files here to replace the auto-generated colored
badges. Files are matched by the station's **brand name**, lowercased with
spaces turned into hyphens and non-alphanumerics removed, plus a `.png`
extension.

| Brand (in data) | Expected file           |
| --------------- | ----------------------- |
| Shell           | `shell.png`             |
| Esso            | `esso.png`              |
| Costco          | `costco.png`            |
| Ultramar        | `ultramar.png`          |
| Bélisle         | `belisle.png`           |
| Petro-Canada    | `petro-canada.png`      |
| Couche-Tard     | `couche-tard.png`       |
| Canadian Tire   | `canadian-tire.png`     |

Accents are stripped when matching (é → e), so **Bélisle** looks for
`belisle.png`.

Any brand without a matching file falls back to a brand-colored badge with the
brand's initials — so the app works fine with none of these present.

> ⚠️ Only add logo assets you are licensed to use. Brand logos are trademarks of
> their respective owners; none are bundled with this project.

Recommended: square PNGs, ~64×64 px, transparent background.
