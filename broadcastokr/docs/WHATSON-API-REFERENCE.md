# WHATS'ON (Mediagenix) API Reference

Crawled from: https://www.mediagenix.tv/api-j7d2XD7sFqcdWGeS/docs/Latest_version/

> **Note:** The API Explorer pages use Stoplight Elements to render OpenAPI specs dynamically via JavaScript. The actual YAML specs are not available as static files — they must be retrieved from a running instance via `GET /api` on each service (e.g., `GET http://localhost:8888/content/v1/api`). This document compiles all information extractable from the release notes and documentation pages.

---

## Platform Overview

Mediagenix documentation is organized into three platform divisions:

1. **Mediagenix Base** — Core broadcast platform (15 APIs)
2. **Mediagenix Hive** — Content & scheduling (5 APIs)
3. **Mediagenix On-demand** — VOD platform

### Mediagenix Base APIs (15 total)

| API | Sosch Relevance | Description |
|-----|-----------------|-------------|
| **Sport API** | CRITICAL | Sport events, leagues, seasons, teams, players |
| **Rights API** | CRITICAL | Contracts, exploitation rights, territorial rights |
| **Linear Schedule API** | CRITICAL | Broadcast transmissions, schedule versions, transmission events |
| **Content API** | HIGH | Programs, episodes, series, seasons, content collections, images |
| **MAM API** | HIGH | Media assets, video/audio components, media positions |
| **Publication API** | MEDIUM | Publication snapshots, publication systems |
| **As-run API** | MEDIUM | As-run records, reconciled broadcast days |
| **On-demand Schedule API** | MEDIUM | On-demand transmissions |
| **Company API** | LOW | Organization data |
| **Person API** | LOW | Talent/personnel |
| **Commercial API** | LOW | Advertisement data |
| **Copyright API** | LOW | IP management |
| **File API** | LOW | File management |
| **Curation API** | LOW | Content curation |
| **Trailer API** | LOW | Promotional content |

### Mediagenix Hive APIs (5 total)

| API | Description |
|-----|-------------|
| Content API for Publication Sheets | Content metadata for publishing |
| Content Budgeting API | Budget management |
| Image Management API | Image upload and management |
| Scheduling API | Scheduling operations |
| Strategic Planning API | Planning features |

### General Technical Principles

- All APIs are REST-based, using JSON format
- Each API provides OpenAPI/Swagger YAML definitions
- YAML specs retrievable via `GET /api` on each service instance
- Authentication: JWT tokens via `POST /login` (Publication API confirmed; likely consistent)
- Common HTTP status codes: 404 (not found), 422 (validation error), 400 (bad request), 403 (forbidden)

---

## Sport API

**Base concept:** Manages sport events, leagues, seasons, teams, and players within the WHATS'ON system.

### Known Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/events` | List sport events (supports filter, sort, pagination) |
| GET | `/events/{eventId}` | Get single sport event |
| POST | `/events` | Create/update sport event |
| PUT | `/events` | Update sport event |
| GET | `/leagues` | List leagues |
| GET | `/leagues/{leagueId}` | Get single league |
| POST | `/leagues` | Create/update league |
| PUT | `/leagues` | Update league |
| GET | `/seasons` | List seasons |
| GET | `/seasons/{seasonId}` | Get single season |
| POST | `/seasons` | Create/update season |
| PUT | `/seasons` | Update season |
| POST | `/eventDays` | Create event day values (added 2024r9) |
| GET | `/eventDays` | Retrieve event day values |
| GET | `/countries` | Get country dropdown values (added 2023r10) |
| GET | `/subTypes` | Get subType dropdown values (added 2023r10) |

### Sport Event Data Model (from release notes)

```json
{
  "sportEventId": "812818000",
  "seasonId": "644363000",
  "leagueId": "644362000",
  "title": "Final",
  "subType": "Mens",
  "country": "UK",
  "groupName": "Final 2"
}
```

### Key Attributes (Events)
- `sportEventId` — External reference
- `seasonId` — Parent season reference
- `leagueId` — Parent league reference
- `title` — Event title
- `subType` — Event sub-type (added 2023r10)
- `country` — Country code (added 2023r10)
- `groupName` — Group name (added 2023r10)

### Key Attributes (Leagues/Seasons)
- `leagueId` — League reference (optional in POST/PUT seasons since 2024r2)
- `subType` — Sub-type classification (added 2023r10)

### Event Day Model (added 2024r9)

```json
{
  "id": "finale",
  "name": "Finale"
}
```

### Version History

| Version | Change |
|---------|--------|
| 2024r9 | Added `POST /eventDays` endpoint |
| 2024r2 | `leagueId` made optional for season updates |
| 2023r10 | Added `subType`, `groupName`, `country` attributes; added `/countries` and `/subTypes` endpoints |
| 2022r7 | Fixed POST /sportEvents update behavior for events linked to episodes |
| 2020r1.002 | External references cannot be cleared via empty/null values |

---

## Rights API

**Base concept:** Manages contracts, exploitation rights, territorial restrictions, and run limitations.

### Known Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/contracts/{contractId}` | Get contract details |
| POST | `/contracts` | Create contract |
| PUT | `/contracts/{contractId}` | Update contract |
| GET | `/exploitationRights/{exploitationRightId}` | Get exploitation right details |
| GET | `/exploitationRights/{exploitationRightId}/runs` | Get runs for an exploitation right |
| POST | `/contractEntries` | Create contract entries with rights |
| GET | `/currencies` | Get currencies with exchange rates |
| PUT | `/currencies/{currencyID}/newExchangeRate` | Update exchange rate |

### Key Data Concepts

#### Contracts
- Contain contract entries with exploitation rights
- Have `contractType` and `contractStatus`
- Support contract numbers (auto-generated or manual depending on settings)
- Link to products via external references

#### Exploitation Rights
- Contain exploitation windows with start/end dates and times
- Support time formulas: `[SA]` (start airing), `[EA]` (end airing), `[SE]` (sport event)
- Have provisional start/end dates with date accuracy
- Can be templates (no run data — returns RIGHTS-00039 error)

#### Exploitation Windows
```json
{
  "startTimeFormula": "[SA] + 0h",
  "endTimeFormula": "[EA] + 0m",
  "startTime": "HH:MM",
  "endTime": "HH:MM"
}
```
Formulas take precedence over absolute times when both provided.

#### Restrictions (Contract Entries)
- **Max runs per unit**: `maxRunsPerUnitRestrictions` with units including "Weekdays" (2025r9)
- **Catch-up**: Restricts by `runTypes` and `runNumbers` (supports `"remainingRuns"`)
- **Overlapping Episodes**: `maxNumberOfEpisodes` per day
- **Manual Validation**: Date-ranged with optional remarks
- **Maximum Planning Period**: Duration-based using `number` and `unit` (hour/day/week/month/quarter/year)

#### Max Runs Example
```json
{
  "maxRunsPerUnitRestrictions": [{
    "fromDate": "2014-01-01",
    "toDate": "2025-04-30",
    "maxNumberOfRuns": {
      "maxNumberRunsPerUnit": 3,
      "unit": "Weekdays"
    }
  }]
}
```

### Error Codes

| Code | Description |
|------|-------------|
| RIGHTS-00015 | Sport event linked content prevents season move |
| RIGHTS-00038 | Parent series cannot be linked to contracts |
| RIGHTS-00039 | Exploitation right templates do not contain run data |
| CORE-00002 | Maximum 2 decimals allowed (amortization) |

### Version History

| Version | Change |
|---------|--------|
| 2025r9 | New restriction units (e.g., "Weekdays") for max runs |
| 2025r5 | Returns 422 instead of crash for template run queries |
| 2024r6 | Franchises return 404 when used as contentId |
| 2024r4 | Improved error messages for product references and rights deletion |
| 2024r3 | Performance fix for contract updates with many rights |
| 2024r2 | Better error messages for company references |
| 2023r9 | Amortization decimal enforcement (max 2) |
| 2023r8 | New restriction types: catch-up, overlapping episodes, manual validation, max planning period; exploitation window times; exchange rate management |
| 2023r7 | Auto-generated contract numbers; provisional dates on exploitation rights |

---

## Linear Schedule API

**Base concept:** Manages broadcast transmissions, schedule versions, time allocations, and transmission events.

### Known Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/transmissions` | Search transmissions (filter by channel, date, scheduleVersion) |
| GET | `/transmissions/{transmissionId}` | Get single transmission |
| POST | `/transmissions` | Create transmission |
| PUT | `/transmissions` | Update transmission |
| POST | `/fullDays` | Batch create transmissions for a full broadcast day |
| GET | `/transmissions/{transmissionId}/transmissionEvents` | Get events within a transmission |
| GET | `/transmissionEvents` | Search transmission events (mandatory: channel, date) |
| GET | `/channels/{channelId}/scheduleVersions` | Get schedule versions for a channel |
| GET | `/timeAllocations` | Get time allocations (mandatory: date, channel) |
| GET | `/transmissions/{transmissionId}/timeAllocations` | Get time allocations within a transmission |

### Transmission Data Model (from response attributes)

```json
{
  "transmissionId": "...",
  "startTime": "HH:MM",
  "startTimeWithSeconds": "HH:MM:SS",
  "announcedTime": "HH:MM",
  "announcedTimeWithSeconds": "HH:MM:SS",
  "duration": "HH:MM:SS",
  "contentId": "...",
  "contentType": "program|episode|...",
  "channelId": "...",
  "scheduleVersion": "...",
  "transmissionType": "...",
  "isProductPremiere": true,
  "mediaAssetId": "...",
  "exploitationRightId": "...",
  "live": true,
  "transmissionParentalRating": "...",
  "publicationRecord": {}
}
```

### Transmission Event Data Model

```json
{
  "reconcileKey": "...",
  "date": "YYYY-MM-DD",
  "startTime": "HH:MM:SS",
  "duration": "HH:MM:SS",
  "timecodeIn": "...",
  "timecodeOut": "...",
  "frameRate": "...",
  "title": "...",
  "contentId": "...",
  "contentType": "...",
  "interstitialType": "...",
  "productCode": "...",
  "mediaAssetId": "...",
  "mediaAssetLabel": "...",
  "videocomponentId": "...",
  "mediaLabel": "...",
  "timeAllocationType": "...",
  "transmissionId": "...",
  "channelId": "..."
}
```

### Time Allocation Data Model

```json
{
  "startTime": "...",
  "title": "...",
  "duration": "...",
  "filledDuration": "...",
  "sellOutDuration": "..."
}
```

### Filter/Sort Operators
Supported on GET endpoints: `eq`, `ne`, `notNull`, `in`, `gt`, `ge`, `lt`, `le`, `between`

### Schedule Versions
- Default: active schedule
- Set only on creation, cannot be changed after
- `GET /channels/{channelId}/scheduleVersions` returns available versions

### Version History

| Version | Change |
|---------|--------|
| 2025r11 | Removed incorrect `machine` attribute from YAML |
| 2024r9 | Added `transmissionType` to YAML schema |
| 2024r8 | Added `transmissionType` and `isProductPremiere` to GET responses |
| 2024r7 | Aligned search calls; made date+channel mandatory on GET /timeAllocations |
| 2024r6 | Franchise linking prevention |
| 2024r4 | Introduced time allocation endpoints |
| 2023r10 | Fixed duration parsing for >99:99:99 |
| 2023r3 | HH:MM:SS format support in POST /fullDays |
| 2023r2 | Live attribute, time format flexibility, frame rate validation |
| 2022r9 | Publication record null handling; title attribute fix |
| 2022r8 | Empty contentId handling in POST /fullDays |
| 2022r7 | Added transmissionParentalRating; publication record validation |
| 2022r4 | New transmission events endpoints |
| 2022r3 | Schedule version support; new response fields |

---

## Content API

**Base concept:** Manages programs, episodes, series, seasons, content collections, images, titles, clearance windows, and historical broadcast dates.

### Known Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/products/{contentId}` | Get any content product |
| GET | `/programs/{contentId}` | Get program |
| POST | `/programs` | Create/update program |
| PUT | `/programs` | Update program |
| GET | `/episodes/{contentId}` | Get episode |
| POST | `/episodes` | Create/update episode |
| PUT | `/episodes` | Update episode |
| GET | `/series/{contentId}` | Get series |
| POST | `/series` | Create/update series |
| PUT | `/series` | Update series |
| GET | `/seasons/{contentId}` | Get season |
| POST | `/seasons` | Create/update season |
| PUT | `/seasons/{contentId}` | Update season |
| POST | `/seasons/{contentId}/versions/{versionId}` | Create season version |
| GET | `/contentCollections/{contentId}` | Get content collection |
| POST | `/contentCollections` | Create content collection (requires `?template=`) |
| PUT | `/contentCollections/{contentId}` | Update collection |
| DELETE | `/contentCollections/{contentId}` | Delete collection |
| POST | `/contentCollectionItems` | Add item to collection |
| PUT | `/contentCollectionItems/{id}` | Update collection item |
| GET | `/contentCollectionItems/{id}` | Get collection item |
| DELETE | `/contentCollectionItems/{id}` | Delete collection item |
| GET | `/titles/{titleId}` | Get title |
| POST | `/titles` | Create title |
| PUT | `/titles/{titleId}` | Update title |
| DELETE | `/titles/{titleId}` | Delete title |
| POST | `/clearanceWindows` | Create clearance window |
| PUT | `/clearanceWindows/{id}` | Update clearance window |
| GET | `/clearanceWindows/{id}` | Get clearance window |
| DELETE | `/clearanceWindows/{id}` | Delete clearance window |
| GET | `/historicalBroadcastDates/{id}` | Get historical broadcast date |
| POST | `/historicalBroadcastDates` | Create historical broadcast date |
| PUT | `/historicalBroadcastDates/{id}` | Update historical broadcast date |
| DELETE | `/historicalBroadcastDates/{id}` | Delete historical broadcast date |
| POST | `/pressSheets` | Create/update press sheets |
| GET | `/channels` | Get channel values |
| GET | `/genres` | Get genre dropdown values |
| GET | `/channelGroups` | Get channel group values |
| GET | `/regionGroups` | Get region group values |
| GET | `/languageGroups` | Get language group values |
| GET | `/contentCollectionIntentions` | Get intention dropdown values |
| GET | `/contentCollectionItemDisplayTypes` | Get display type values |
| GET | `/origins` | Get origin values |
| GET | `/contentProducers` | Get producer values |
| GET | `/contentCodes` | Get content code values |
| GET | `/frequencies` | Get frequency values |
| GET | `/videoFormats` | Get video format values |
| GET | `/productionModes` | Get production mode values |
| GET | `/planningCategories` | Get planning category values |
| GET | `/appreciations` | Get appreciation values |
| GET | `/sound` | Get sound values |

### Common Content Attributes (Programs/Episodes/Series/Seasons)

- `contentId` — External reference
- `sigmaId` — Reference for Mediagenix Hive integration
- `productTitles` — Array of titles with `id`
- `images` — Array with `imageId`, `highResolutionURL`, `identification`, `pressTargets[]`
- `ratings` — Including `contentWarnings` array
- `genre` / `genres` — Mutually exclusive (single vs multi-select)
- `partOfContentCollections` — Array with `contentCollectionId`, `contentCollectionType`, `contentCollectionStructure`, `contentCollectionItemIds`
- `historicalBroadcastDates` — Array of historical broadcast date IDs
- `clearanceWindows` — Array of clearance window IDs
- `customAttributes` — Supports types: Boolean, Date, Decimal, Dropdown, Duration, Integer, Reference, String, Text, Web, Point in time
- `dvdReleaseDate`, `dvdReleaseDateForeign`
- `productionNumber`, `origin`, `contentProducer`, `contentCode`, `keywords`, `frequency`, `videoFormat`, `productionMode`, `sound`, `appreciation`, `planningCategories`, `countryOfSubject`, `contractRequired`

### Clearance Window Data Model

```json
{
  "clearanceWindowId": "...",
  "contentId": "...",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "startTime": "...",
  "endTime": "...",
  "channelGroups": [],
  "regionGroups": [],
  "languageGroups": [],
  "remarks": "..."
}
```

### Content Warning Data Model

```json
{
  "contentWarnings": [{
    "id": "...",
    "value": "...",
    "type": "checkBox|dropDown|text",
    "comment": "..."
  }]
}
```

### Query Parameters

- `propagateToVersions` — Values: `onlyIfValuesAreEqual` (default), `always`, `never`
- `propagateToEpisodes` — Same values, for season-level propagation
- `template` — Required for content collection creation

---

## MAM API

**Base concept:** Manages media assets, video/audio/subtitling components, media positions, and segmentation profiles.

### Known Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/mediaAssets` | Search media assets |
| GET | `/mediaAssets/{mediaAssetId}` | Get media asset |
| POST | `/completeMediaAssets` | Create complete media asset with components |
| PUT | `/completeMediaAssets` | Update complete media asset |
| GET | `/videoComponents/{videoComponentId}` | Get video component |
| POST | `/videoComponents` | Create video component |
| PUT | `/videoComponents` | Update video component |
| GET | `/media` | Search media |
| GET | `/medias/{mediaId}` | Get single media |
| POST | `/media` | Create media (optional `?template=`) |
| PUT | `/media/{mediaId}` | Update media |
| DELETE | `/media/{mediaId}` | Delete media |
| POST | `/mediaPositions` | Create media position |
| PUT | `/mediaPositions/{mediaPositionId}` | Update media position |
| GET | `/mediaPositions/{mediaPositionId}` | Get media position |
| DELETE | `/mediaPositions/{mediaPositionId}` | Delete media position |
| GET | `/mediaPositions` | Search media positions (filter by type, subType, mediaId) |
| GET | `/mediaTemplates` | List media prototype templates |
| GET | `/departments` | Get department values |
| GET | `/dynamicRanges` | Get dynamic range values |
| GET | `/transferMethods` | Get transfer method values |
| GET | `/mediaPositionTypes` | Get position type values |
| GET | `/mediaPositionSubtypes` | Get position subtype values |
| GET | `/mediaPositionStatuses` | Get position status values |
| GET | `/dropdown/concept/{conceptName}/customAttribute/{attributeName}` | Get custom attribute dropdown values |

### Media Asset Attributes
- `mediaAssetId`, `label`, `mediaAssetLabel`
- `contentType` — From PSIProductType dropdown
- `frameRate`
- `sourceMediaAssetId` — Source media asset reference (added 2025r12)
- `linkedMediaAssets`
- `segmentationProfile` — Returns profile identifiers
- `customAttributes` — Supports Point in time type (2025r10)

### Media Position Data Model

```json
{
  "mediaPositionId": "9501808044",
  "type": "FTP",
  "subType": "Videos",
  "mediaId": "1111456000",
  "position": "Files",
  "url": "file://FTP/videofolder",
  "status": "Requested"
}
```

### Media Data Model

```json
{
  "label": "...",
  "status": "...",
  "library": "...",
  "type": "...",
  "networkPath": "...",
  "TCIN": "...",
  "TCOUT": "...",
  "MAMMediaId": "...",
  "filesize": "...",
  "fileFormat": "...",
  "encoding": "...",
  "frameRate": "...",
  "linkedMediaAssets": []
}
```

### Video Component Attributes
- `dynamicRange` — e.g., "hdr", "sdr" (added 2024r9)
- `transferMethod` — e.g., "hlg" (added 2024r9)

---

## Publication API

**Base concept:** Manages publication snapshots and publication systems. First API to run on the BAPI 2.0 framework.

### Known Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/publication-systems` | Search publication systems |
| GET | `/publication-snapshots` | Get publication snapshots (most recent per "Published" status) |
| GET | `/publication-snapshots/{id}` | Get single publication snapshot |
| PATCH | `/publication-snapshots/{id}` | Update snapshot response/remarks |
| GET | `/publication-system-responses` | Get response dropdown values |
| POST | `/login` | Authenticate and receive JWT token |

### Publication System Response

```json
{
  "publicationSystemId": "...",
  "kind": "...",
  "name": "..."
}
```

### Publication Snapshot Response

```json
{
  "publicationSnapshotId": "...",
  "publicationSystemId": "...",
  "contentId": "...",
  "lastPublishedOn": "...",
  "response": "Received|Error|...",
  "remarks": "..."
}
```

### Query Parameters
- `sort` — `publicationSystemId`, `name`, `kind`, `lastPublishedOn`, `publicationSystem`
- `filter` — `lastPublishedOn`, `publicationSystemId`, `contentId`
- `limit` — Results per page (default 25)
- `offset` — Pagination offset

Response metadata: `limit`, `offset`, `totalNumberOfObjects`, `numberOfObjectsOmitted`

---

## As-run API

**Base concept:** Tracks broadcast occurrences and reconciles actual airings against scheduled transmissions.

### Known Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/asrunrecords` | Create/update as-run records |
| GET | `/reconciledDays` | Get reconciled events and transmissions for a day |
| GET | `/api` | Get YAML specification |

### As-Run Record Schema

```json
{
  "channelId": "required",
  "reconcileKey": "required",
  "title": "...",
  "duration": "...",
  "scheduledContent": "...",
  "timeAllocationType": "...",
  "remarks": "...",
  "calendarDate": "YYYY-MM-DD",
  "startTime": "HH:MM:SS",
  "localStartTimestamp": "YYYY-MM-DDTHH:MM:SS.III",
  "UTCStartTimestamp": "YYYY-MM-DDTHH:MM:SSZ"
}
```

Timestamp fields are mutually exclusive: use either `calendarDate`+`startTime`, `localStartTimestamp`, or `UTCStartTimestamp`.

### Reconciled Day Response

```json
{
  "channelId": "...",
  "dayStatus": "...",
  "startDate": "...",
  "transmissions": [{
    "transmissionId": "...",
    "startTime": "...",
    "startTimeUTC": "...",
    "duration": "...",
    "productId": "...",
    "productCode": "...",
    "productType": "...",
    "subtitle": "..."
  }]
}
```

---

## On-Demand Schedule API

**Base concept:** Manages on-demand (VOD) transmissions.

### Known Key Attributes (from release notes)
- `contentId` — Content reference
- `mediaAssetId` — Linked media asset (added 2022r3)
- `contentType` — Content type (added 2022r3)
- `exploitationRightId` — Linked right (added 2022r3)
- `customAttributes` — Supports Point in time type (2025r10)

### Key Behaviors
- External references cannot be cleared via API (2020r1.002)
- Updating/deleting transmissions with linked publication records is now allowed (2024r2)
- Custom attributes supported since 2024r2

---

## Common Patterns Across All APIs

### Authentication
- JWT tokens via `POST /login`
- Token previously exposed in REST exchange logs (fixed in Publication API 2025r12)

### Filtering
```
?filter=eq(fieldName,value);eq(field2,value2)
```
Operators: `eq`, `ne`, `notNull`, `in`, `gt`, `ge`, `lt`, `le`, `between`

### Pagination
```
?limit=25&offset=0
```
Response includes: `totalNumberOfObjects`, `numberOfObjectsOmitted`

### Sorting
```
?sort=fieldName
```

### Custom Attributes
```
?customAttributes=attributeName,attributeName
?customAttributes=allCustomAttributes
```

Supported types: Boolean, Date, Decimal number, Drop-down lists, Duration, Integer, Reference, String, Text, Web, Point in time

### YAML Specification Access
Each API serves its OpenAPI spec at `GET /api` (e.g., `GET http://localhost:8888/content/v1/api`)

### Common Error Patterns
- 400: Bad request (malformed payload)
- 404: Resource not found
- 422: Validation error ("Operation cannot be completed due to violations")
- 403: Forbidden (insufficient permissions)
- 500: Server error (most have been fixed to return proper error codes)

### External References
- Cannot be cleared via empty/null values in POST/PUT calls (protection added across all APIs)
- Used as the primary cross-reference mechanism between Sosch and WHATS'ON

---

## Sosch Integration Mapping

### Critical Integration Points

| Sosch Feature | WHATS'ON API | Endpoints |
|---------------|-------------|-----------|
| Event sync | Sport API | `GET /events`, `GET /events/{eventId}` |
| League/competition data | Sport API | `GET /leagues`, `GET /seasons` |
| Rights matrix | Rights API | `GET /exploitationRights/{id}`, `GET /contracts/{id}` |
| Schedule data | Linear Schedule API | `GET /transmissions`, `GET /transmissionEvents` |
| Schedule changes | Linear Schedule API | `GET /transmissions` (poll for changes or need webhook) |
| Content metadata | Content API | `GET /programs/{id}`, `GET /episodes/{id}` |
| Media assets | MAM API | `GET /mediaAssets`, `GET /media` |
| Broadcast rundown | Linear Schedule API | `GET /transmissionEvents` (channel + date filter) |
| Channel info | Content API / Linear Schedule | `GET /channels`, `GET /channels/{id}/scheduleVersions` |

### Key Gaps for Sosch

1. **No webhook/event system documented** — All data access is pull-based (GET). Sosch needs either polling or a separate webhook mechanism for real-time schedule changes.
2. **No direct "rights per territory per event" endpoint** — Rights are structured around contracts and exploitation rights, not directly per sport event. Sosch will need to traverse: Event → Content → Contract Entry → Exploitation Right → Territory restrictions.
3. **No social media concepts** — WHATS'ON has no social media awareness. All social publishing logic lives entirely in Sosch.
4. **Rundown ≈ Transmission Events** — The `GET /transmissionEvents` endpoint (filtered by channel + date) is the closest to a broadcast rundown for second-screen integration.
5. **Sport Event ≠ Transmission** — Sport events and linear schedule transmissions are separate concepts linked via `contentId`. A sport event may have multiple transmissions across channels.
