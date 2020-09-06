var Story=require("../models/story");
var Comment=require("../models/comment");

var middlewareObj={};

middlewareObj.checkStoryOwnership=function(req,res,next){
    if(req.isAuthenticated()){
        Story.findById(req.params.id, function(err, foundStory){
            if(err || !foundStory){
                req.flash("error","Story not found!");
                res.redirect("back");
            } else {
                if(foundStory.author.id.equals(req.user._id) || req.user.isAdmin)
                {
                    next();
                } else {
                    req.flash("error","You don't have permission to do that!");
                    res.redirect("back");
                }
            }
        })
    } else {
        req.flash("error","You need to login to perform this action!");
        res.redirect("back");
    }
}

middlewareObj.checkCommentOwnership=function(req,res,next){
    if(req.isAuthenticated()){
        Comment.findById(req.params.comment_id, function(err, foundComment){
            if(err){
                req.flash("error","Comment not found!");
                res.redirect("back");
            } else {
                if(foundComment.author.id.equals(req.user._id) || req.user.isAdmin){
                    next();
                } else {
                    req.flash("error","You don't have permission to do that!");
                    res.redirect("back");
                }
            }
        })
    } else {
        req.flash("error","You need to login to perform this action!");
        res.redirect("back");
    }
}

middlewareObj.isLoggedIn=function(req,res,next){
    if(req.isAuthenticated()){
        return next();
    }
    req.flash("error","You need to login to perform this action!");
    res.redirect("/login");
}

module.exports=middlewareObj;