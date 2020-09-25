// This is only going to work for the 2020-2021 school year, probably

import fetch from 'node-fetch'
import cheerio from 'cheerio'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'

import { ImgurUrlManager } from './get-clubs-gdrive-thumbnails.js'

const spreadsheetUrl =
  'https://docs.google.com/spreadsheets/u/1/d/1HUaNWegOIk972lGweoSuNcXtfX7XuGBTQU-gcTsvD9s/pub'

async function main () {
  const imgurUrls = new ImgurUrlManager()

  // Generated by update-clubs-links.js
  const inputPath = fileURLToPath(
    new URL('../json/clubs-links.json', import.meta.url)
  )
  const links = await fs
    .readFile(inputPath, 'utf-8')
    .then(JSON.parse)
    .catch(() => ({}))

  const html = await fetch(spreadsheetUrl).then(r => r.text())
  const $ = cheerio.load(html, { xmlMode: false })

  const clubs = {}

  $('table tbody tr:not(:first-child)').each(function () {
    // The first <td> is invisible for some reason
    const [
      ,
      newness,
      name,
      tierText,
      desc,
      day,
      time,
      link,
      president,
      teacher,
      email,
      coteacher,
      coemail
    ] = $(this)
      .children()
      .map(function () {
        return (
          $(this)
            .text()
            .trim()
            // Replace nbsp with space
            .replace(/\xa0/g, ' ')
        )
      })
      .get()
      // If it's empty, return `undefined` so that it's omitted from the JSON
      .map(str => str || undefined)

    if (!name) return

    const tierMatch = /TIER ([123]) CLUB/.exec(tierText)
    if (!tierMatch) {
      console.warn('Could not determine tier from', tierText, name)
    }
    const tier = tierMatch ? +tierMatch[1] : undefined

    if (newness !== 'NEW THIS YEAR!' && newness !== 'Returning') {
      console.warn(newness, 'is not NEW... or Returning', name)
    }

    const noSecondsTime = time.replace(':00', '')

    const { video, zoom, time: time2, president: president2, signup } =
      links[name] || {}
    const actualTime2 =
      time2 &&
      time2.replace(/(MON|TUES|WED|THURS|FRI)(\/(MON|TUES|WED|THURS|FRI))?/, '')
    if (links[name]) {
      if (president !== president2) {
        console.warn(president, 'is not the same PRESIDENT as', president2)
      }
      if (noSecondsTime !== actualTime2) {
        console.warn(time, 'is not the same TIME as', time2)
      }
      if (link && link !== zoom) {
        console.warn(link, 'is not the same ZOOM LINK as', zoom)
      }
      delete links[name]
    }

    clubs[name] = {
      new: newness.includes('NEW'),
      desc,
      day,
      // Will assume that the document is generally more accurate than Lisa
      // Hall's spreadsheet (not always the case though, as someone put "11:40
      // PM" for their time on the document)
      time: actualTime2 || noSecondsTime,
      link: link || zoom,
      video,
      signup,
      tier,
      president,
      coteacher,
      coemail,
      teacher,
      email
    }
  })

  for (const club of Object.values(clubs)) {
    await imgurUrls.setThumbnailIfNeeded(club)
  }
  await imgurUrls.save()

  const outputPath = fileURLToPath(
    new URL('../json/clubs.json', import.meta.url)
  )
  await fs.writeFile(outputPath, JSON.stringify(clubs, null, '\t'))

  if (Object.keys(links).length) {
    console.log('Not matched:', Object.keys(links))
  }
}
main()
