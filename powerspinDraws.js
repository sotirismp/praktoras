const axios = require("axios").default;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function powerspinDraws(DRAWS, ACTIVE) {
  let response = await axios.get(
    "https://api.opap.gr/draws/v3.0/1110/last/100"
  );
  if (response.statusText === "OK" && response.status == 200) {
    ACTIVE.drawId = response.data[0].drawId;
    ACTIVE.drawTime = response.data[0].drawTime;
    for (let i = 1; i < response.data.length; i++) {
      let a = { ...response.data[i] };
      DRAWS.push({
        drawId: a.drawId,
        drawTime: a.drawTime,
        listWinningNumbers: [...a.listWinningNumbers],
      });
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
            });
            DRAWS.splice(-1);
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
