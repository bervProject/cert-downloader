const puppeteer = require('puppeteer');
const Parse = require('parse/node');
const { convert, sizes } = require('image-to-pdf');
const fs = require('fs');

async function getCerts()
{
  const links = [];
  const query = new Parse.Query('Certification');
  query.equalTo('Source', 'Azure');
  query.descending('Expiration');
  try {
    const response = await query.find();
    for (const resp of response) {
      links.push(resp.get('Link'));
    }
  } catch (err) {
    console.error(err);
  }
  return links;
}

async function loadImage(url, index) {
  console.log('load[%d]: %s', index, url);
  const browser = await puppeteer.launch({ defaultViewport: null, args: [
    "--no-sandbox"
  ] });
  const page = await browser.newPage();
  await page.goto(url, {
    waitUntil: 'networkidle0',
    timeout: 60_000
  });
  await page.setViewport({ width: 1920, height: 1080 });
  await page.emulateMediaFeatures([
    { name: "prefers-color-scheme", value: "light" },
  ]);
  await page.waitForNetworkIdle();
  const section = await page.waitForSelector('section[data-test-id="credential-hero"]', {
    waitUntil: 'networkidle0'
  });
  const fileOutput = `temp/cert-${index}.png`;
  await section.screenshot({
    path: fileOutput,
  });
  console.log('created[%d]: %s', index, fileOutput);
  await browser.close();
  return fileOutput;
}

async function createPdf() {
  try {
    if (!fs.existsSync('temp')) {
      fs.mkdirSync('temp');
    }
  } catch (err) {
    console.error(err);
  }
  Parse.initialize(process.env.PARSE_APP_ID, process.env.PARSE_JS_KEY);
  Parse.serverURL = "https://parseapi.back4app.com/";
  const certs = await getCerts();
  console.log("Total certs: %d", certs.length);
  if (certs.length === 0) {
    console.log("No Data!");
    return;
  }
  const imagePromises = [];
  certs.forEach((cert, i) => {
    imagePromises.push(loadImage(cert, i));
  })
  const imagePath = await Promise.allSettled(imagePromises);
  const pages = [];
  imagePath.forEach(promiseResult => {
    if (promiseResult.status === "fulfilled")
    {
      const img = promiseResult.value;
      console.log("read to buffer: %s", img);
      try {
        pages.push(fs.readFileSync(img));
      } catch (errFile) {
        console.error("Error reading: %s. Err: %s", img, errFile);
      }
    } else {
      console.log("failed: %s", promiseResult.reason);
    }
  });
  if (pages.length === 0) {
    console.log("No Pages!");
    return;
  }
  console.log("Merging: %d images", pages.length);
  try {
    convert(pages, [sizes.A4[1], sizes.A4[0]]).pipe(fs.createWriteStream('temp/output.pdf'))
    console.log("Merged: %d images", pages.length);
  } catch (err) {
    console.error(err);
  }
}

createPdf();
