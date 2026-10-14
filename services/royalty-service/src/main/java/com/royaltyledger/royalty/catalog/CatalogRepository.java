package com.royaltyledger.royalty.catalog;

import com.royaltyledger.royalty.calc.RateCard;
import com.royaltyledger.royalty.calc.Split;
import java.util.*;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class CatalogRepository {

    public record Track(String isrc, String title, String artistName) {}

    public record RightsHolder(long id, String name, String type) {}

    private final JdbcClient jdbc;

    public CatalogRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public List<Track> tracks() {
        return jdbc.sql("SELECT isrc, title, artist_name FROM track ORDER BY isrc").query(Track.class).list();
    }

    public Map<String, Track> tracksByIsrc() {
        Map<String, Track> out = new HashMap<>();
        tracks().forEach(t -> out.put(t.isrc(), t));
        return out;
    }

    public List<RightsHolder> holders() {
        return jdbc.sql("SELECT id, name, type FROM rights_holder ORDER BY name").query(RightsHolder.class).list();
    }

    public Optional<RightsHolder> holder(long id) {
        return jdbc.sql("SELECT id, name, type FROM rights_holder WHERE id = ?").param(id).query(RightsHolder.class).optional();
    }

    public Map<String, List<Split>> splitsByIsrc() {
        Map<String, List<Split>> out = new HashMap<>();
        jdbc.sql("SELECT isrc, holder_id, share_bps FROM royalty_split").query(rs -> {
            out.computeIfAbsent(rs.getString("isrc").trim(), k -> new ArrayList<>())
                    .add(new Split(rs.getLong("holder_id"), rs.getInt("share_bps")));
        });
        return out;
    }

    public RateCard rateCard() {
        Map<String, Long> rates = new HashMap<>();
        jdbc.sql("SELECT tier, territory, micros_per_play FROM rate_card")
                .query(rs -> { rates.put(rs.getString("tier") + "|" + rs.getString("territory").trim(), rs.getLong("micros_per_play")); });
        return new RateCard(rates);
    }
}
