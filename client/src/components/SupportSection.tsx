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
    <div className="support-container">
      <div className="support-header">
        <div className="support-brand">
          <img src="/logo.svg" alt="Linda" className="support-logo" />
          <span>Linda Support</span>
        </div>
        <button onClick={onClose} className="btn-close">×</button>
      </div>

      <div className="support-hero">
        <h1>How can we help?</h1>
        <div className="support-search-wrap">
          <input 
            type="text" 
            placeholder="Search for articles..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="support-search-input"
          />
        </div>
      </div>

      <div className="support-content">
        {selectedArticle ? (
          <div className="article-view">
            <button onClick={() => setSelectedArticle(null)} className="btn-back">
              ← Back to Help
            </button>
            <div className="article-header">
              <span className="article-category">{selectedArticle.category}</span>
              <h2 className="article-title">{selectedArticle.title}</h2>
            </div>
            <div className="article-body">
              {selectedArticle.content.split('\n').map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </div>
        ) : (
          <div className="support-grid">
            {categories.map(category => (
              <div key={category} className="support-category-card">
                <h3>{category}</h3>
                <ul className="article-list">
                  {filteredArticles
                    .filter(a => a.category === category)
                    .map(article => (
                      <li key={article.id} onClick={() => setSelectedArticle(article)}>
                        {article.title}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SupportSection;
