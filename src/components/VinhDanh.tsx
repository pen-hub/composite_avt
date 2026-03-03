/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { Trophy, RefreshCw } from 'lucide-react';
import { getSupabaseClient, SUPABASE_BADGE_SAVED_VIEW } from '../lib/supabase';

const BACKGROUND_IMAGE_URL = new URL('../../2-01.png', import.meta.url).href;

const MOCK_OTHER_WINNERS = [
  { id: 4,  rank: 4,  name: 'Nguyễn Văn A' },
  { id: 5,  rank: 5,  name: 'Trần Thị B' },
  { id: 6,  rank: 6,  name: 'Lê Văn C' },
  { id: 7,  rank: 7,  name: 'Phạm Thị D' },
  { id: 8,  rank: 8,  name: 'Hoàng Văn E' },
  { id: 9,  rank: 9,  name: 'Ngô Thị F' },
  { id: 10, rank: 10, name: 'Đặng Văn G' },
  { id: 11, rank: 11, name: 'Bùi Thị H' },
  { id: 12, rank: 12, name: 'Vũ Văn I' },
  { id: 13, rank: 13, name: 'Dương Thị K' },
];


type BadgeData = {
  id: number;
  image_data: string;
  text2_value: string | null;
  frame_asset: string | null;
  created_at: string;
};

type WinnerData = {
  id: number;
  name: string;
  team: string;
  rank: number;
  badgeImage: string;
  score: number;
  badgeId: number;
};

export default function VinhDanh() {
  const [winners, setWinners] = useState<WinnerData[]>([]);
  const [otherWinners, setOtherWinners] = useState<WinnerData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBadges = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseClient();
      const { data, error: fetchError } = await supabase
        .from(SUPABASE_BADGE_SAVED_VIEW)
        .select('id, image_data, text2_value, frame_asset, created_at')
        .order('created_at', { ascending: false });

      if (fetchError) {
        throw fetchError;
      }

      if (!data || data.length === 0) {
        setWinners([]);
        setOtherWinners([]);
        setIsLoading(false);
        return;
      }

      // Group badges by text2_value (tên nhân sự)
      const groupedBadges = data.reduce((acc, badge) => {
        // Keep all badges, but hide name for invalid text2_value
        let name = badge.text2_value?.trim() || '';
        if (name === '' || name === 'CỤM THỨ 2') {
          // Group badges without valid name together, but don't show name
          name = '__NO_NAME__';
        }
        if (!acc[name]) {
          acc[name] = [];
        }
        acc[name].push(badge as BadgeData);
        return acc;
      }, {} as Record<string, BadgeData[]>);

      // Convert to winner data with score = number of badges
      // Keep all badges including those without valid names
      const winnersList: WinnerData[] = Object.entries(groupedBadges).map(([name, badges], index) => {
        // Extract team from name if possible, or use default
        const teamMatch = name.match(/Team\s+(\w+)/i);
        const team = teamMatch ? teamMatch[1] : ['Alpha', 'Beta', 'Gama', 'Delta'][index % 4];
        
        return {
          id: index + 1,
          name: name === '__NO_NAME__' ? '' : name, // Hide name for badges without valid name
          team: team,
          rank: 0, // Will be set after sorting
          badgeImage: badges[0].image_data, // Use first badge image (will be replaced for top 3)
          score: badges.length, // Score = number of badges
          badgeId: badges[0].id,
        };
      });

      // Sort by score (number of badges) descending
      winnersList.sort((a, b) => b.score - a.score);

      // Assign ranks
      winnersList.forEach((winner, index) => {
        winner.rank = index + 1;
      });

      // For top 3, get random images from corresponding frame_asset
      const top3Winners = winnersList.slice(0, 3);
      const allBadges = data as BadgeData[];
      
      // Ensure we have exactly 3 winners for display
      const displayWinners: WinnerData[] = [];
      for (let i = 0; i < 3; i++) {
        if (i < top3Winners.length) {
          displayWinners.push({ ...top3Winners[i] });
        } else {
          // Create placeholder winner
          displayWinners.push({
            id: i + 1,
            name: '',
            team: '',
            rank: i + 1,
            badgeImage: '',
            score: 0,
            badgeId: 0,
          });
        }
      }
      
      // Fill images: mỗi TOP chỉ lấy ảnh đúng frame_asset của nó
      displayWinners.forEach((winner, index) => {
        const rank = index + 1; // 1, 2, or 3
        const frameAsset = `top ${rank}.png`;
        
        // Chỉ lấy ảnh có frame_asset khớp đúng (case-insensitive, trim)
        const matchingBadges = allBadges.filter(badge => {
          const badgeFrame = badge.frame_asset?.trim() || '';
          return badgeFrame.toLowerCase() === frameAsset.toLowerCase();
        });
        
        if (matchingBadges.length > 0) {
          const randomIndex = Math.floor(Math.random() * matchingBadges.length);
          winner.badgeImage = matchingBadges[randomIndex].image_data;
          winner.badgeId = matchingBadges[randomIndex].id;
        } else {
          // Không có ảnh khớp → để trống
          winner.badgeImage = '';
          winner.badgeId = 0;
        }
      });

      // Others = from rank 4 onwards (from original winnersList)
      const others = winnersList.slice(3);

      // Use displayWinners (with correct images) for the top 3 display
      setWinners(displayWinners);
      setOtherWinners(others);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu');
      console.error('Error loading badges:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBadges();
  }, [loadBadges]);

  // Render-time display order: [rank3 left, rank1 center, rank2 right]
  const displayWinners = [
    winners[2] || { id: 3, name: '', team: '', rank: 3, badgeImage: '', score: 0, badgeId: 0 },
    winners[0] || { id: 1, name: '', team: '', rank: 1, badgeImage: '', score: 0, badgeId: 0 },
    winners[1] || { id: 2, name: '', team: '', rank: 2, badgeImage: '', score: 0, badgeId: 0 },
  ];
  return (
    <div className="h-screen w-full bg-[#004D25] flex flex-col items-center p-0 font-sans overflow-hidden relative">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Radial Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80vw] h-[80vw] bg-emerald-400/20 rounded-full blur-[120px]" />
        
        {/* Particles/Sparkles (Simulated) */}
        <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-yellow-400 rounded-full blur-[1px] animate-pulse" />
        <div className="absolute top-1/3 right-1/3 w-3 h-3 bg-yellow-200 rounded-full blur-[2px] animate-pulse delay-75" />
        <div className="absolute bottom-1/4 left-1/3 w-2 h-2 bg-yellow-300 rounded-full blur-[1px] animate-pulse delay-150" />
        <div className="absolute top-20 right-20 w-1 h-1 bg-white rounded-full blur-[0px] animate-ping" />
        
        {/* Bottom Golden Waves/Curtains (Simulated with gradients) */}
        <div className="absolute bottom-0 left-0 w-full h-64 bg-gradient-to-t from-[#C49102]/20 to-transparent" />
        <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-[#FDB931]/10 blur-[80px] rounded-full" />
        <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-[#FDB931]/10 blur-[80px] rounded-full" />
      </div>

      {/* Main Content - Full Screen Layout */}
      <div className="relative z-10 w-full h-full flex flex-col lg:flex-row items-stretch justify-center gap-0 px-0 pb-0">
        
        {/* Left Panel: Podium (70%) */}
        <div className="w-full lg:w-[70%] flex flex-col justify-center bg-white/5 backdrop-blur-sm rounded-none border border-white/5 border-r-0 p-4 shadow-xl relative overflow-hidden">
          {/* Background Image */}
          <div 
            className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-80"
            style={{ 
              backgroundImage: `url(${BACKGROUND_IMAGE_URL})`,
              filter: 'contrast(1.2) saturate(1.1)'
            }}
          />
          {/* Subtle background glow for podium */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-gradient-to-b from-yellow-500/5 to-transparent pointer-events-none z-10" />
          
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-white/60 flex items-center gap-2">
                <RefreshCw size={24} className="animate-spin" />
                <span>Đang tải dữ liệu...</span>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-red-300 text-center">
                <p className="mb-2">Lỗi: {error}</p>
                <button
                  onClick={loadBadges}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm transition"
                >
                  Thử lại
                </button>
              </div>
            </div>
          ) : winners.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-white/60 text-center">
                <Trophy size={48} className="mx-auto mb-4 opacity-50" />
                <p>Chưa có dữ liệu vinh danh</p>
                <p className="text-sm mt-2">Hãy tạo và lưu một số badge để hiển thị</p>
              </div>
            </div>
          ) : (
            <div className="flex items-end justify-center gap-4 md:gap-10 lg:gap-12 w-full h-full pb-0 pt-0 relative z-10 -mt-8 lg:-mt-12 xl:-mt-16">
              {/* Rank 3 (Left) */}
              <div className="order-1 transform -translate-y-16 lg:-translate-y-24 xl:-translate-y-32">
                <WinnerCard winner={displayWinners[0]} />
              </div>

              {/* Rank 1 (Center) */}
              <div className="order-2 -mt-20 lg:-mt-28 z-20 transform -translate-y-32 lg:-translate-y-44 xl:-translate-y-56">
                <WinnerCard winner={displayWinners[1]} isCenter />
              </div>

              {/* Rank 2 (Right) */}
              <div className="order-3 transform -translate-y-16 lg:-translate-y-24 xl:-translate-y-32">
                <WinnerCard winner={displayWinners[2]} />
              </div>
            </div>
          )}
        </div>

        {/* Right Panel: Other Winners List (30%) */}
        <div className="w-full lg:w-[30%] flex flex-col">
          <div className="w-full bg-black/20 backdrop-blur-md rounded-none border border-white/10 overflow-hidden shadow-2xl flex flex-col h-full">
            {/* List Header Title */}
            <div className="px-5 py-3 border-b border-white/10 bg-white/5 flex items-center justify-between shrink-0">
              <h2 className="text-lg font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Trophy size={20} className="text-yellow-400" />
                Bảng Xếp Hạng
              </h2>
              <div className="text-white/40 text-xs font-mono">
                TOP 4 - {3 + MOCK_OTHER_WINNERS.length}
              </div>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-black/20 text-yellow-400/80 font-bold uppercase tracking-wider text-xs sticky top-0 z-10 backdrop-blur-sm shrink-0">
              <div className="col-span-2 text-center">Rank</div>
              <div className="col-span-10">Nhân sự</div>
            </div>
            
            <div className="overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent p-3">
              <div className="space-y-2">
                {MOCK_OTHER_WINNERS.map((winner, index) => (
                  <motion.div
                    key={winner.id}
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.05 }}
                    className="grid grid-cols-12 gap-2 px-3 py-3 items-center bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 transition-all rounded-lg group"
                  >
                    <div className="col-span-2 flex justify-center">
                      <div className="w-8 h-8 rounded-full bg-black/30 border border-white/20 group-hover:border-yellow-400/60 flex items-center justify-center text-white font-bold text-sm transition-colors">
                        {winner.rank}
                      </div>
                    </div>
                    <div className="col-span-10 flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg border border-white/20 bg-white/10 shrink-0" />
                      <span className="text-white font-semibold text-sm truncate">{winner.name}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function WinnerCard({ winner, isCenter = false }: { winner: WinnerData, isCenter?: boolean }) {
  // Sizes - Larger sizes
  const containerSize = isCenter ? "w-64 h-64 lg:w-80 lg:h-80 xl:w-96 xl:h-96" : "w-52 h-52 lg:w-64 lg:h-64 xl:w-72 xl:h-72";
  
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: winner.rank * 0.2, type: "spring", stiffness: 100 }}
      className="flex flex-col items-center relative z-10 group"
    >
      {/* Main Badge Container - No Frame */}
      <div className={`relative ${containerSize} flex items-center justify-center`}>
        
        {/* Ambient Glow */}
        <div className="absolute inset-0 bg-[#FFD700]/20 rounded-full blur-3xl transform scale-125" />

        {/* TOP Rank Badge */}
        {winner.rank <= 3 && (
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20">
            <div className={`px-4 py-1.5 rounded-full font-black text-white shadow-lg ${
              winner.rank === 1 ? 'bg-gradient-to-r from-yellow-400 to-yellow-600 text-yellow-900' :
              winner.rank === 2 ? 'bg-gradient-to-r from-gray-300 to-gray-500 text-gray-900' :
              'bg-gradient-to-r from-orange-400 to-orange-600 text-orange-900'
            }`}>
              <span className="text-xs lg:text-sm uppercase tracking-wider">TOP {winner.rank}</span>
            </div>
          </div>
        )}

        {/* Badge Image - Direct Display */}
        <div className="w-full h-full relative z-0">
          {winner.badgeImage ? (
            <img 
              src={winner.badgeImage} 
              alt={winner.name} 
              className="w-full h-full object-contain transform transition-transform duration-700 group-hover:scale-105 drop-shadow-2xl"
            />
          ) : (
            <div className="w-full h-full bg-gray-700/50 rounded-lg flex flex-col items-center justify-center border-2 border-white/20">
              <span className="text-white/40 text-xs mb-1">Chưa có ảnh</span>
              <span className="text-white/60 text-xs font-bold uppercase">Chưa có</span>
            </div>
          )}
        </div>
      </div>

      {/* Name Info - Only show if name exists */}
      {winner.name && (
        <div className="mt-6 lg:mt-8 text-center flex flex-col items-center w-64">
          <h3 className="text-transparent bg-clip-text bg-gradient-to-r from-[#FFD700] via-[#FFF] to-[#FFD700] font-black text-sm lg:text-base uppercase tracking-wider drop-shadow-sm whitespace-nowrap overflow-hidden text-ellipsis w-full filter drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
            {winner.name}
          </h3>
        </div>
      )}
    </motion.div>
  );
}
