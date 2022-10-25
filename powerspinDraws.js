const axios = require("axios").default;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function initPowerspinStats(POWERSPIN_STATS) {
  for (let i = 1; i <= 24; i++) {
    POWERSPIN_STATS[0].delays.numbers[i] = 0;
    POWERSPIN_STATS[1].delays.numbers[i] = 0;
    POWERSPIN_STATS[2].delays.numbers[i] = 0;
  }
  return POWERSPIN_STATS;
}

function increaseByOnePowerspinStats(POWERSPIN_STATS) {
  for (let y = 0; y <= 2; y++) {
    for (let i = 1; i <= 24; i++) {
      POWERSPIN_STATS[y].delays.numbers[i]++;
    }
    POWERSPIN_STATS[y].delays["Symbol"]++;
    POWERSPIN_STATS[y].delays["Red"]++;
    POWERSPIN_STATS[y].delays["Blue"]++;
    POWERSPIN_STATS[y].delays["Green"]++;
  }

  return POWERSPIN_STATS;
}

async function powerspinDraws(DRAWS, POWERSPIN_STATS, ACTIVE) {
  let response = await axios.get(
    "https://api.opap.gr/draws/v3.0/1110/last/100"
  );

  POWERSPIN_STATS = initPowerspinStats(POWERSPIN_STATS);

  if (response.statusText === "OK" && response.status == 200) {
    ACTIVE.drawId = response.data[0].drawId;
    ACTIVE.drawTime = response.data[0].drawTime;
    for (let i = 1; i < response.data.length; i++) {
      let a = { ...response.data[i] };
      DRAWS.push({
        drawId: a.drawId,
        drawTime: a.drawTime,
        listWinningNumbers: [...a.listWinningNumbers],
        prizeCategories: [...a.prizeCategories],
      });
    }

    for (let i = DRAWS.length - 1; i >= 0; i--) {
      POWERSPIN_STATS = increaseByOnePowerspinStats(POWERSPIN_STATS);
      for (let y = 0; y <= 2; y++) {
        if (DRAWS[i].listWinningNumbers[y].sidebets.symbol) {
          POWERSPIN_STATS[y].delays["Symbol"] = 0;
        } else {
          POWERSPIN_STATS[y].delays.numbers[
            DRAWS[i].listWinningNumbers[y].list[0]
          ] = 0;
          POWERSPIN_STATS[y].delays[
            DRAWS[i].listWinningNumbers[y].sidebets.color
          ] = 0;
        }
      }
    }

    let changed = false;
    do {
      await sleep(ACTIVE.drawTime - Date.now() + 3000);
      do {
        response = await axios.get(
          "https://api.opap.gr/draws/v3.0/1110/last-result-and-active"
        );
        if (response.statusText === "OK" && response.status == 200) {
          if (response.data.last.drawId === ACTIVE.drawId) {
            DRAWS.unshift({
              drawId: response.data.last.drawId,
              drawTime: response.data.last.drawTime,
              listWinningNumbers: [...response.data.last.listWinningNumbers],
              prizeCategories: [...response.data.last.prizeCategories],
            });
            DRAWS.splice(-1);

            POWERSPIN_STATS = increaseByOnePowerspinStats(POWERSPIN_STATS);
            for (let y = 0; y <= 2; y++) {
              if (response.data.last.listWinningNumbers[y].sidebets.symbol) {
                POWERSPIN_STATS[y].delays["Symbol"] = 0;
              } else {
                POWERSPIN_STATS[y].delays.numbers[
                  response.data.last.listWinningNumbers[y].list[0]
                ] = 0;
                POWERSPIN_STATS[y].delays[
                  response.data.last.listWinningNumbers[y].sidebets.color
                ] = 0;
              }
            }

            ACTIVE.drawId = response.data.active.drawId;
            ACTIVE.drawTime = response.data.active.drawTime;
            changed = true;
          } else {
            await sleep(1000);
          }
        }
      } while (!changed);
      changed = false;
    } while (true);
  }
}

module.exports = powerspinDraws;
