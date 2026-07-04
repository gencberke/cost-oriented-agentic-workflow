# Review brief: upstream weather error mapping

Review this WebClient change. The public endpoint should return 404 when the city
does not exist, while upstream authentication failures, forbidden responses, bad
requests, and rate limits must retain useful non-404 semantics for operators and
clients. Report introduced/worsened defects only; list unrelated issues
separately. Use only this brief and `review.diff`.
