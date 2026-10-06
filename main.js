const glados = async () => {
  const notice = []
  if (!process.env.GLADOS || !process.env.GLADOS.trim()) {
    process.exitCode = 1
    return ['Checkin Error', 'Missing GLADOS secret']
  }
  // GLaDOS 签到会校验 UA 是否与登录时的浏览器一致, 多帐号时按行与 GLADOS 一一对应
  const agents = String(process.env.GLADOS_UA || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const cookies = String(process.env.GLADOS).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (!agents.length) {
    console.warn('GLADOS_UA is missing; set it to the User-Agent of the browser used to log in to GLaDOS. The fallback UA may be rejected.')
  }
  for (const [index, cookie] of cookies.entries()) {
    try {
      const domain = process.env.DOMAIN || 'glados.cloud'
      const common = {
        'cookie': cookie,
        'referer': `https://${domain}/console/checkin`,
        'user-agent': agents[index] || agents[0] || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      }
      const action = await fetch(`https://${domain}/api/user/checkin`, {
        method: 'POST',
        headers: { ...common, 'content-type': 'application/json' },
        body: JSON.stringify({ token: domain }),
      }).then((r) => r.json())
      if (action?.code) throw new Error(`${action?.message} (code=${action?.code}${action?.reason ? ', reason=' + action.reason : ''})`)
      const status = await fetch(`https://${domain}/api/user/status`, {
        method: 'GET',
        headers: { ...common },
      }).then((r) => r.json())
      if (status?.code) throw new Error(status?.message)
      notice.push(
        'Checkin OK',
        `${action?.message}`,
        `Left Days ${Number(status?.data?.leftDays)}`
      )
    } catch (error) {
      process.exitCode = 1
      notice.push(
        'Checkin Error',
        `${error}`,
        `<${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}>`
      )
    }
  }
  return notice
}

const notify = async (notice) => {
  if (!process.env.NOTIFY || !notice) return
  for (const option of String(process.env.NOTIFY).split('\n')) {
    if (!option) continue
    try {
      if (option.startsWith('console:')) {
        // Results are always printed by main, even without a NOTIFY secret.
        continue
      } else if (option.startsWith('wxpusher:')) {
        await fetch(`https://wxpusher.zjiecode.com/api/send/message`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            appToken: option.split(':')[1],
            summary: notice[0],
            content: notice.join('<br>'),
            contentType: 3,
            uids: option.split(':').slice(2),
          }),
        })
      } else if (option.startsWith('pushplus:')) {
        await fetch(`https://www.pushplus.plus/send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            token: option.split(':')[1],
            title: notice[0],
            content: notice.join('<br>'),
            template: 'markdown',
          }),
        })
      } else if (option.startsWith('bark:')) {
        await fetch(`https://api.day.app/${option.split(':')[1]}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: notice[0],
            body: notice.slice(1).join('\n'),
          }),
        })
      } else if (option.startsWith('qyweixin:')) {
        const qyweixinToken = option.split(':')[1]
        const qyweixinNotifyRebotUrl = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=' + qyweixinToken;
        await fetch(qyweixinNotifyRebotUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            msgtype: 'markdown',
            markdown: {
                content: notice.join('<br>')
            }
          }),
        })
      } else {
        // fallback
        await fetch(`https://www.pushplus.plus/send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            token: option,
            title: notice[0],
            content: notice.join('<br>'),
            template: 'markdown',
          }),
        })
      }
    } catch (error) {
      throw error
    }
  }
}

const main = async () => {
  const notice = await glados()
  for (const line of notice || []) {
    console.log(line)
  }
  await notify(notice)
}

main().catch((error) => {
  console.error('Checkin Error', String(error))
  process.exitCode = 1
})
