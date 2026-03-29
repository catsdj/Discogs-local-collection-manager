# Discogs Collection Manager

A modern, responsive web application for managing and browsing your Discogs vinyl collection with advanced filtering, sorting, and YouTube integration.

![Discogs Collection Manager](https://img.shields.io/badge/Next.js-15.5.3-black?style=for-the-badge&logo=next.js)
![React](https://img.shields.io/badge/React-19.1.1-blue?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9.2-blue?style=for-the-badge&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.1.13-38B2AC?style=for-the-badge&logo=tailwind-css)

## ✨ Features

### 🎵 Collection Management
- **Discogs API Integration**: Fetch and display your vinyl collection
- **Advanced Filtering**: Filter by music styles, artists, labels, and more
- **Smart Sorting**: Sort by title, artist, year, date added, or price
- **Pagination**: Efficient browsing with customizable page sizes

### 🎨 Dual View Modes
- **Table View**: Traditional spreadsheet-style display with sortable columns
- **Card View**: Visual card-based layout with cover images and detailed information
- **Responsive Design**: Optimized for desktop, tablet, and mobile devices

### 🎬 YouTube Integration
- **Video Discovery**: Automatically fetch YouTube videos for releases
- **Multiple Sources**: Discogs page videos, API playlists, and individual tracks
- **Smart Caching**: Reduce API calls with intelligent caching system
- **Background Processing**: Fetch detailed release information in the background

### 🎯 Advanced Features
- **Real-time Updates**: Live status indicators for data freshness
- **Condition Tracking**: Media and sleeve condition monitoring
- **Price Information**: Marketplace price tracking
- **Tracklist Display**: Complete track information with scrolling
- **Export Capabilities**: Excel export functionality (planned)

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Discogs API token

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/catsdj/Discogs-collection-manager.git
   cd Discogs-collection-manager
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup** (Required)
   
   **Option A: Interactive Setup (Recommended)**
   ```bash
   npm run setup
   ```
   
   **Option B: Manual Setup**
   ```bash
   # Copy the environment template
   cp env.example .env.local
   
   # Edit .env.local with your actual Discogs credentials
   # Replace the placeholder values with your real API token and username
   ```

   **Your `.env.local` file should contain:**
   ```bash
   DISCOGS_API_TOKEN=your_actual_discogs_token_here
   DISCOGS_USERNAME=your_discogs_username
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

   **Get your Discogs API token:** [https://www.discogs.com/settings/developers](https://www.discogs.com/settings/developers)

### 🔐 Security Note

- **Never commit `.env.local` to version control** - it contains your private API credentials
- The `env.example` file is safe to commit as it only contains template values
- Your local `.env.local` file is automatically ignored by Git

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🛠️ Technology Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS 4, Shadcn UI components
- **API**: Discogs REST API
- **Caching**: Local storage with smart cache management
- **Deployment**: Vercel-ready configuration

## 📱 Screenshots

### Table View
- Sortable columns with advanced filtering
- Real-time data freshness indicators
- Responsive design for all screen sizes

### Card View
- Visual card layout with cover images
- Organized sections: Release info, tracklist, condition/price, videos
- Alternating row colors for better readability
- Fixed-height sections for consistent alignment

## 🔧 Configuration

### Environment Variables
```env
DISCOGS_API_TOKEN=your_discogs_api_token
DISCOGS_USERNAME=your_discogs_username
```

### Discogs API Setup
1. Visit [Discogs API Settings](https://www.discogs.com/settings/developers)
2. Generate a personal access token
3. Add your token to the environment variables

## 📊 Features in Detail

### Filtering & Sorting
- **Style Filtering**: Multi-select dropdown for music genres
- **Advanced Filters**: Artist, label, year, condition filters
- **Smart Sorting**: Multiple sort options with direction toggle
- **Pagination**: Customizable items per page (8-48 for cards, 10-100 for table)

### Data Management
- **Smart Caching**: Automatic caching of release details
- **Background Jobs**: Long-running tasks for bulk data fetching
- **Rate Limiting**: Respects Discogs API limits
- **Error Handling**: Graceful fallbacks for missing data

### YouTube Integration
- **Multiple Sources**: Discogs page scraping, API playlists, individual videos
- **Video Categorization**: Automatic playlist and video detection
- **Performance Optimized**: Links instead of embedded players for better performance
- **Scrollable Lists**: Fixed-height containers with overflow scrolling

## 🎯 Roadmap

### Phase 1 (Current MVP)
- ✅ Basic collection browsing
- ✅ Dual view modes (table/cards)
- ✅ Advanced filtering and sorting
- ✅ YouTube video integration
- ✅ Responsive design

### Phase 2 (Planned)
- [ ] Excel export functionality
- [ ] Collection statistics and analytics
- [ ] Wishlist management
- [ ] Price tracking and alerts
- [ ] Mobile app (React Native)

### Phase 3 (Future)
- [ ] Social features (sharing collections)
- [ ] Recommendation engine
- [ ] Integration with music streaming services
- [ ] Advanced search with AI

## 🤝 Contributing

We welcome contributions using the fork and pull request workflow below.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.

## 🙏 Acknowledgments

- [Discogs](https://www.discogs.com/) for providing the comprehensive music database API
- [Next.js](https://nextjs.org/) team for the amazing React framework
- [Tailwind CSS](https://tailwindcss.com/) for the utility-first CSS framework
- [Shadcn UI](https://ui.shadcn.com/) for the beautiful component library

## 📞 Support

If you encounter any issues or have questions:

1. Check the [Issues](https://github.com/catsdj/Discogs-collection-manager/issues) page
2. Create a new issue with detailed information
3. Join [Discussions](https://github.com/catsdj/Discogs-collection-manager/discussions) for community support

---

**Made with ❤️ for vinyl collectors everywhere**
