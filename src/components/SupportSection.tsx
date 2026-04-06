import React, { useState } from 'react';
import { supportData } from '../supportData';
import type { SupportArticle } from '../supportData';

interface SupportSectionProps {
  onClose: () => void;
}

const SupportSection: React.FC<SupportSectionProps> = ({ onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<SupportArticle | null>(null);

  const filteredArticles = supportData.filter(article => 
    article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    article.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    article.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categories = Array.from(new Set(supportData.map(a => a.category)));

  return (
    <div className="p-6 lg:p-12 max-w-6xl mx-auto space-y-12 animate-fadeIn h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/20 p-2 rounded-xl">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="text-xl font-bold text-primary tracking-tight uppercase">Linda Support</span>
        </div>
        <button onClick={onClose} className="btn btn-ghost btn-circle">✕</button>
      </div>

      {!selectedArticle && (
        <div className="text-center space-y-8 py-16 bg-base-300/20 rounded-[3rem] border border-white/5 shadow-inner px-6">
          <h1 className="text-5xl font-bold tracking-tighter">How can we help?</h1>
          <div className="relative max-w-xl mx-auto">
            <input 
              type="text" 
              placeholder="Search for articles, guides, or troubleshooting..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input input-bordered w-full rounded-2xl h-16 shadow-2xl focus:border-primary pl-14 text-lg border-white/5"
            />
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 absolute left-5 top-1/2 -translate-y-1/2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      )}

      <div className="mt-8">
        {selectedArticle ? (
          <div className="max-w-3xl mx-auto space-y-8 animate-fadeIn">
            <button onClick={() => setSelectedArticle(null)} className="btn btn-ghost btn-sm rounded-xl gap-2 font-bold px-4">
              ← Back to Help
            </button>
            <div className="card bg-base-200 border border-white/5 shadow-2xl overflow-hidden rounded-[2.5rem]">
              <div className="p-10 space-y-6">
                <div className="flex items-center gap-2">
                  <span className="badge badge-primary badge-outline h-6 px-3 text-[10px] font-bold uppercase tracking-widest">{selectedArticle.category}</span>
                </div>
                <h2 className="text-4xl font-bold tracking-tight">{selectedArticle.title}</h2>
                <div className="space-y-4 opacity-80 leading-relaxed text-lg pt-4 border-t border-white/5">
                  {selectedArticle.content.split('\n').map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {categories.map(category => (
              <div key={category} className="card bg-base-200 shadow-xl border border-white/5 hover:border-primary/20 transition-all group rounded-[2rem]">
                <div className="card-body gap-6 p-8">
                  <h3 className="card-title text-sm font-bold uppercase tracking-widest opacity-40 text-primary">{category}</h3>
                  <ul className="space-y-1">
                    {filteredArticles
                      .filter(a => a.category === category)
                      .map(article => (
                        <li 
                          key={article.id} 
                          onClick={() => setSelectedArticle(article)}
                          className="p-3 hover:bg-primary/5 rounded-xl cursor-pointer transition-all flex items-center justify-between group/item"
                        >
                          <span className="font-bold opacity-70 group-hover/item:opacity-100 group-hover/item:text-primary transition-colors">{article.title}</span>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 opacity-0 group-hover/item:opacity-100 -translate-x-2 group-hover/item:translate-x-0 transition-all text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                          </svg>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SupportSection;
