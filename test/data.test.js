import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activitiesFromCSV, activityFromGPX, aggregateByMonth, demoActivities, mergeActivities,
  parseDate, parseDuration, parseNumber, totalsFor, yearsOf,
} from '../js/data.js';

test('getallen met punt of komma', () => {
  assert.equal(parseNumber('25,31'), 25.31);
  assert.equal(parseNumber('25.31'), 25.31);
  assert.equal(parseNumber('1.234,5'), 1234.5);
  assert.equal(parseNumber('1,234.5'), 1234.5);
  assert.ok(Number.isNaN(parseNumber('')));
});

test('duur in seconden of uu:mm:ss', () => {
  assert.equal(parseDuration('5025'), 5025);
  assert.equal(parseDuration('1:23:45'), 5025);
});

test('datums uit Strava (Engels en Nederlands) en dd-mm-jjjj', () => {
  const en = parseDate('Jan 5, 2024, 8:12:33 AM');
  assert.deepEqual([en.getFullYear(), en.getMonth(), en.getDate()], [2024, 0, 5]);
  const nl = parseDate('5 mrt. 2024 08:12:33');
  assert.deepEqual([nl.getFullYear(), nl.getMonth(), nl.getDate(), nl.getHours()], [2024, 2, 5, 8]);
  const dmy = parseDate('31-12-2025');
  assert.deepEqual([dmy.getFullYear(), dmy.getMonth(), dmy.getDate()], [2025, 11, 31]);
  assert.equal(parseDate('geen datum'), null);
});

test('Strava-export: eerste Distance-kolom (km), alleen fietsritten', () => {
  const csv = [
    'Activity ID,Activity Date,Activity Name,Activity Type,Elapsed Time,Distance,Moving Time,Elevation Gain,Distance',
    '1,"Jan 5, 2024, 8:12:33 AM","Rondje, met komma",Ride,4000,40.5,3600,210.0,40500',
    '2,"Jan 6, 2024, 9:00:00 AM",Hardlopen,Run,1800,5.0,1800,10,5000',
    '3,"Feb 2, 2024, 9:00:00 AM",Zwift,Virtual Ride,3700,30.0,3650,400,30000',
  ].join('\n');
  const { activities, skipped } = activitiesFromCSV(csv);
  assert.equal(activities.length, 2);
  assert.equal(skipped, 1);
  assert.equal(activities[0].name, 'Rondje, met komma');
  assert.equal(activities[0].distanceKm, 40.5);
  assert.equal(activities[0].movingSec, 3600);
  assert.equal(activities[0].elevationM, 210);
});

test('eigen CSV met puntkomma en Nederlandse kolommen', () => {
  const { activities } = activitiesFromCSV('datum;afstand;tijd;hoogtemeters\n03-03-2026;42,5;1:38:10;120\n');
  assert.equal(activities.length, 1);
  assert.equal(activities[0].distanceKm, 42.5);
  assert.equal(activities[0].movingSec, 5890);
  assert.equal(new Date(activities[0].date).getMonth(), 2);
});

test('CSV zonder datum of afstand geeft een duidelijke fout', () => {
  assert.throws(() => activitiesFromCSV('naam,iets\na,b\n'), /datum/);
});

test('GPX: afstand, hoogtemeters en tijd', () => {
  const pts = Array.from({ length: 11 }, (_, i) =>
    `<trkpt lat="${(52 + i * 0.001).toFixed(4)}" lon="5.0"><ele>${i * 3}</ele><time>2025-06-01T08:00:${String(i * 5).padStart(2, '0')}Z</time></trkpt>`);
  const gpx = `<gpx><trk><name>Testrit</name><trkseg>${pts.join('')}</trkseg></trk></gpx>`;
  const a = activityFromGPX(gpx);
  assert.equal(a.name, 'Testrit');
  assert.ok(Math.abs(a.distanceKm - 1.112) < 0.01, `afstand ${a.distanceKm}`);
  assert.equal(a.elevationM, 30);
  assert.equal(a.movingSec, 50);
  assert.throws(() => activityFromGPX('<gpx></gpx>'), /track/);
});

test('maandtotalen, jaartotalen en samenvoegen', () => {
  const ride = (id, date, km) => ({ id, date: new Date(date).toISOString(), name: 'r', type: 'Rit', distanceKm: km, movingSec: 3600, elevationM: 100 });
  const list = mergeActivities(
    [ride('a', '2025-03-10T10:00', 40), ride('b', '2025-03-20T10:00', 60)],
    [ride('b', '2025-03-20T10:00', 65), ride('c', '2024-07-01T10:00', 50), ride('d', '2025-08-15T10:00', 30)],
  );
  assert.equal(list.length, 4);
  assert.deepEqual(yearsOf(list), [2025, 2024]);
  const months = aggregateByMonth(list, 2025);
  assert.equal(months[2].rides, 2);
  assert.equal(months[2].distanceKm, 105);
  assert.equal(months[7].distanceKm, 30);
  assert.equal(months[0].rides, 0);
  assert.equal(totalsFor(list, 2025).distanceKm, 135);
  assert.equal(totalsFor(list, 2025, { month: 2, day: 15 }).distanceKm, 40);
});

test('voorbeeldritten liggen niet in de toekomst', () => {
  const today = new Date(2026, 5, 15);
  const demo = demoActivities(today);
  assert.ok(demo.length > 100);
  assert.ok(demo.every((a) => new Date(a.date) <= today));
  assert.deepEqual(yearsOf(demo), [2026, 2025, 2024]);
});
