"use client";

import React, { useState } from 'react';

interface NavLink {
    label: string;
    href: string;
    isActive?: boolean;
}

interface Partner {
    logoUrl: string;
    href: string;
}

interface ResponsiveHeroBannerProps {
    logoUrl?: string;
    backgroundImageUrl?: string;
    navLinks?: NavLink[];
    ctaButtonText?: string;
    ctaButtonHref?: string;
    badgeText?: string;
    badgeLabel?: string;
    title?: string;
    titleLine2?: string;
    description?: string;
    primaryButtonText?: string;
    primaryButtonHref?: string;
    secondaryButtonText?: string;
    secondaryButtonHref?: string;
    partnersTitle?: string;
    partners?: Partner[];
    children?: React.ReactNode;
}

const ResponsiveHeroBanner: React.FC<ResponsiveHeroBannerProps> = ({
    logoUrl = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=200&q=80",
    backgroundImageUrl = "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=2000&q=80",
    navLinks = [
        { label: "Home", href: "#", isActive: true },
        { label: "Analyses", href: "#" },
        { label: "RAG Engine", href: "#" }
    ],
    ctaButtonText = "Start Analysis",
    ctaButtonHref = "#search",
    badgeLabel = "",
    badgeText = "",
    title = "Investment Research",
    titleLine2 = "AI Investment Analyst",
    description = "Autonomously inspect financial statement ratios, compute market sentiment metrics, map moat durability, and formulate actionable verdicts using a local custom deep learning network.",
    primaryButtonText = "New Analysis",
    primaryButtonHref = "#search",
    secondaryButtonText = "Learn More",
    secondaryButtonHref = "#features",
    partnersTitle = "Supporting global markets & standard financial integrations",
    partners = [],
    children
}) => {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    return (
        <section className="w-full isolate min-h-screen overflow-hidden relative flex flex-col justify-between">
            <img
                src={backgroundImageUrl}
                alt=""
                className="w-full h-full object-cover absolute top-0 right-0 bottom-0 left-0 -z-10 opacity-[0.06]"
            />
            <div className="pointer-events-none absolute inset-0 ring-1 ring-black/5 bg-gradient-to-b from-[#F8F8F6] via-[#F8F8F6]/70 to-[#F8F8F6]" />

            <div className="z-10 relative flex-1 flex flex-col justify-center">
                <div className="sm:pt-28 md:pt-32 lg:pt-36 max-w-7xl mx-auto pt-24 px-6 pb-16">
                    <div className="mx-auto max-w-3xl text-center">
                        {badgeText && (
                            <div className="mb-6 inline-flex items-center gap-3 rounded-full bg-black/5 px-2.5 py-1.5 ring-1 ring-black/5 backdrop-blur animate-fade-slide-in-1">
                                {badgeLabel && (
                                    <span className="inline-flex items-center text-xs font-semibold text-white bg-[#1A1A1A] rounded-full py-0.5 px-2.5 font-sans">
                                        {badgeLabel}
                                    </span>
                                )}
                                <span className="text-xs font-medium text-[#6B6B6B] font-sans pr-1.5">
                                    {badgeText}
                                </span>
                            </div>
                        )}

                        <h1 className="sm:text-5xl md:text-6xl lg:text-7xl leading-tight text-4xl text-[#1A1A1A] tracking-tight font-serif font-normal animate-fade-slide-in-2">
                            {title}
                            <br className="hidden sm:block" />
                            {titleLine2}
                        </h1>

                        <p className="sm:text-lg animate-fade-slide-in-3 text-base text-[#6B6B6B] max-w-2xl mt-6 mx-auto">
                            {description}
                        </p>

                        <div className="mt-8 animate-fade-slide-in-4">
                            {children}
                        </div>
                    </div>

                    {partners && partners.length > 0 && (
                        <div className="mx-auto mt-20 max-w-5xl">
                            <p className="animate-fade-slide-in-1 text-sm text-[#9B9B9B] text-center">
                                {partnersTitle}
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 animate-fade-slide-in-2 text-[#9B9B9B] mt-6 items-center justify-items-center gap-4">
                                {partners.map((partner, index) => (
                                    <a
                                        key={index}
                                        href={partner.href}
                                        className="inline-flex items-center justify-center bg-center w-[120px] h-[36px] bg-cover rounded-full opacity-80 hover:opacity-100 transition-opacity"
                                        style={{ backgroundImage: `url(${partner.logoUrl})` }}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
};

export default ResponsiveHeroBanner;
