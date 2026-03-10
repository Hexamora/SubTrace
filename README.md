<div align="center">

# 🔍 SubTrace

**High-performance subdomain reconnaissance — straight from your browser.**

*No backend. No setup. No limits.*

[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-subtrace.vercel.app-blue?style=for-the-badge)](https://subtrace.vercel.app)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://github.com/Hexamora/SubTrace)
[![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://subtrace.vercel.app)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

</div>

---

## 📖 About

**SubTrace** is a high-performance reconnaissance tool designed to trace and map subdomains with surgical precision. Built entirely in **Pure JavaScript** — no backend, no server, no installation required.

Engineered for security researchers who need more than just a list, but a clear path to their target's digital footprint — all running **directly in the browser** via DNS-over-HTTPS.

---

## ✨ Features

- ⚡ **Real-time Subdomain Enumeration** — live results as they're discovered
- 🌐 **Pure Browser-based** — zero backend, zero server dependency
- 🔒 **DNS-over-HTTPS (DoH)** — encrypted DNS queries via Google or Cloudflare
- 🎛️ **Adjustable Concurrency** — 10 / 20 / 30 / 50 concurrent requests
- 📋 **Custom Wordlist Support** — use built-in or upload your own wordlist
- 📊 **Response Time Filtering** — filter by Fast `<100ms` or Slow `>500ms`
- 🔵 **IPv6 Detection** — identify IPv6-enabled subdomains
- 📤 **Export Results** — download findings as `.csv` or `.txt`
- 📈 **Discovery Timeline** — visual graph of subdomain discovery over time
- 🖥️ **Live Log** — real-time log of every DNS query made

---

## ✨ User Interface
<div align="center">
  <img width="48%" height="345" alt="Page" src="https://github.com/Hexamora/SubTrace/blob/7d50f7a014e37a4e22fea2dd4e8494cedec3def1/Page%20_UI.png" />
  &nbsp;
  <img width="48%" height="345" alt="Result" src="https://github.com/Hexamora/SubTrace/blob/7d50f7a014e37a4e22fea2dd4e8494cedec3def1/Result_UI.png" />
</div>

---

## 🚀 Live Demo

> Try it directly — no install needed.

🔗 **[https://subtrace.vercel.app](https://subtrace.vercel.app)**

---

## 🛠️ How It Works

SubTrace sends DNS queries through **DNS-over-HTTPS (DoH)** providers directly from the browser:

```
Browser → DoH Provider (Google / Cloudflare) → DNS Resolution → Result
```

Each subdomain from the wordlist is queried concurrently, with results streamed back in real-time. No data ever touches a third-party server — everything runs client-side.

---

## 🎮 Usage

1. Buka **[subtrace.vercel.app](https://subtrace.vercel.app)**
2. Masukkan target domain — contoh: `google.com`
3. Pilih konfigurasi scan:
   - **Concurrency** — jumlah request paralel
   - **DoH Provider** — Google atau Cloudflare
   - **Wordlist** — pilih wordlist bawaan atau upload custom
4. Klik **Scan** dan lihat hasil real-time
5. Filter dan **Export** hasil ke CSV atau TXT

---

## ⚙️ Configuration

| Setting | Options | Default |
|---|---|---|
| **Concurrency** | 10, 20, 30, 50 | 10 |
| **DoH Provider** | Google, Cloudflare | Google |
| **Wordlist** | subdomains.txt, sublist.txt, Custom | subdomains.txt |

---

## 📁 Project Structure

```
SubTrace/
├── index.html          # Main application entry point
├── assets/
│   ├── js/             # Core scanning logic & DoH resolver
│   └── css/            # Styling & UI components
└── backup/             # Backup files
```

---

## 🧰 Tech Stack

| Tech | Role |
|---|---|
| **Vanilla JavaScript** | Core scanning engine |
| **DNS-over-HTTPS API** | Encrypted DNS resolution |
| **HTML / CSS** | UI & layout |
| **Vercel** | Hosting & deployment |

---

## ⚠️ Legal Disclaimer

> SubTrace is intended **strictly for educational purposes, authorized penetration testing, and security research on systems you own or have explicit permission to test.**
>
> Unauthorized subdomain scanning may violate local laws and regulations. The author is **not responsible** for any misuse of this tool.

---

## 👤 Author

**Hexamora**
- GitHub: [@Hexamora](https://github.com/Hexamora)

---

<div align="center">

*Built with precision for the security community.*

⭐ **Star this repo if you find it useful!**

</div>
