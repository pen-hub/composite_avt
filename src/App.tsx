/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import BadgeMaker from './components/BadgeMaker';
import VinhDanh from './components/VinhDanh';

export default function App() {
  const [view, setView] = useState<'badge' | 'vinhdanh'>('badge');

  return (
    <div>
      {/* Navigation Tabs */}
      <div className="fixed top-4 right-4 z-50 flex gap-2 bg-white/10 backdrop-blur-md rounded-lg p-1 border border-white/20">
        <button
          onClick={() => setView('badge')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            view === 'badge'
              ? 'bg-white/20 text-white shadow-lg'
              : 'text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          Badge Maker
        </button>
        <button
          onClick={() => setView('vinhdanh')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            view === 'vinhdanh'
              ? 'bg-white/20 text-white shadow-lg'
              : 'text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          Vinh Danh
        </button>
      </div>

      {/* Content */}
      {view === 'badge' ? <BadgeMaker /> : <VinhDanh />}
    </div>
  );
}
