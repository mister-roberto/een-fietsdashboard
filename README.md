# Fietsdashboard

Maakt van je ritten grafieken per maand: afstand, aantal ritten, hoogtemeters en tijd op de fiets,
met een vergelijking met het jaar ervoor, de opgetelde afstand door het jaar en een maandtabel.

Alles draait in de browser. Je ritten worden alleen lokaal bewaard (`localStorage`); er wordt niets verstuurd.

## Gebruiken

```bash
npm start
```

Open daarna <http://localhost:8000>. Er is geen build-stap en er zijn geen afhankelijkheden;
elke statische webserver (ook GitHub Pages) werkt.

Kies **Ritten inlezen** (of sleep bestanden naar het venster):

- **Strava-export** – vraag bij Strava je gegevens op (Instellingen → Mijn account → Je account downloaden)
  en kies `activities.csv` uit de zip. Engelse en Nederlandse exports werken; alleen fietsritten tellen mee.
- **GPX-bestanden** – meerdere tegelijk kan. Afstand, hoogtemeters en tijd in beweging worden uit de track berekend.
- **Eigen CSV** – met minstens een kolom `datum` en `afstand` (km), optioneel `tijd`, `hoogtemeters`, `naam` en `type`.
  Zie `voorbeeld/ritten.csv`.

Opnieuw inlezen van dezelfde rit geeft geen dubbele telling. Zonder eigen gegevens kun je het dashboard
bekijken met voorbeeldritten.

## Ontwikkelen

```bash
npm test
```

- `js/data.js` – inlezen (CSV, GPX) en optellen per maand; zonder DOM, dus in Node te testen
- `js/charts.js` – SVG-grafieken (kolommen en lijn) met tooltip
- `js/app.js` – de pagina: inlezen, filters, tegels, grafieken en tabel
